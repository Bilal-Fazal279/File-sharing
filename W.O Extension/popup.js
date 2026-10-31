// ------------------- Popup UI Logic -------------------
const checkBtn = document.getElementById("check");
const resultsContainer = document.getElementById("results");

// HUD Elements for Progress Tracking
const taskCompletionText = document.querySelectorAll(".value.cyan-text")[0];
const taskProgressBar = document.querySelectorAll(".progress-fill.cyan-glow")[0];
const accuracyText = document.querySelectorAll(".value.green-text")[0];
const accuracyProgressBar = document.querySelectorAll(".progress-fill.green-glow")[0];

/**
 * Main Event Listener for the Check Button
 */
checkBtn.addEventListener("click", async () => {
    // 1. Reset UI to Scanning State
    resultsContainer.innerHTML = `
    <div class="scanning-loader">
      <span class="pulse-dot"></span>
      <span class="cyan-text">ANALYZING SYSTEM DATA...</span>
    </div>`;

    checkBtn.disabled = true;
    checkBtn.innerHTML = `SCANNING... <span class="arrow">»</span>`;

    // 2. Query for the active SAP Tab
    let [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (currentTab.url && currentTab.url.includes("IW32-display")) {
        chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            function: checkWorkOrderPage,
        });
    } else {
        showCard("SYSTEM ERROR", "Not on IW-32 Display Page", "error");
        resetButton();
    }
});

/**
 * Listener for results sent back from the Injected Script
 */
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "WORK_ORDER_RESULTS") {
        resultsContainer.innerHTML = "";
        resetButton();

        // --- CALCULATE HUD PROGRESS ---
        const totalChecks = msg.results.length;
        const successCount = msg.results.filter(r => r.includes("✅")).length;
        const completionPercentage = totalChecks > 0 ? Math.round((successCount / totalChecks) * 100) : 0;

        // --- MULTI-STAGE COLOR LOGIC ---
        if (taskCompletionText && taskProgressBar) {
            taskCompletionText.innerText = `${completionPercentage}.00%`;
            taskProgressBar.style.width = `${completionPercentage}%`;

            let hudColor, hudGlow;

            if (completionPercentage < 50) {
                hudColor = "#ff4d4d"; // Red
                hudGlow = "0 0 15px #ff4d4d";
            } else if (completionPercentage >= 50 && completionPercentage < 75) {
                hudColor = "#00f3ff"; // Cyan
                hudGlow = "0 0 12px #00f3ff";
            } else if (completionPercentage >= 75 && completionPercentage < 100) {
                hudColor = "#f1c40f"; // Yellow
                hudGlow = "0 0 15px #f1c40f";
            } else {
                hudColor = "#39ff14"; // Green (100%)
                hudGlow = "0 0 20px #39ff14";
            }

            // Apply styles to bar and percentage text
            taskProgressBar.style.background = hudColor;
            taskProgressBar.style.boxShadow = hudGlow;
            taskCompletionText.style.color = hudColor;
        }

        // Accuracy Readout (Static HUD simulation)
        if (accuracyText && accuracyProgressBar) {
            const accuracy = totalChecks > 0 ? 98.42 : 0;
            accuracyText.innerText = `${accuracy}%`;
            accuracyProgressBar.style.width = `${accuracy}%`;
        }

        // --- RENDER HUD CARDS ---
        console.log("msg areee: ",msg );
        msg.results.forEach((r) => {
            const isSuccess = r.includes("✅");
            const cleanText = r.replace(/✅|❌|⚠️|<\/?[^>]+(>|$)/g, "").trim();
            const parts = cleanText.split(":");
            showCard(parts[0] || "SCAN ITEM", parts[1] || "DATA NOT FOUND", isSuccess ? "success" : "error");
        });
    }
});

function resetButton() {
    checkBtn.disabled = false;
    checkBtn.innerHTML = `CHECK WORK ORDER <span class="arrow">»</span>`;
}

/**
 * Creates the Futuristic HUD Card HTML with Contextual Icons
 */
function showCard(label, value, status) {
    const card = document.createElement("div");
    card.className = "item-card";
    const statusIcon = status === "success" ? "✔" : "⚠";

    // --- CONTEXTUAL ICON LOGIC ---
    let contextIcon = "🔍"; // Default icon
    const upperLabel = label.toUpperCase();

    if (upperLabel.includes("PERSONAL")) {
        contextIcon = "👤"; // Identity
    } else if (upperLabel.includes("FIRST OP")) {
        contextIcon = "👤"; // Gear/Operation
    } else if (upperLabel.includes("EQUIPMENT")) {
        contextIcon = "🏷️"; // Tag/Equipment
    } else if (upperLabel.includes("WORK HRS")) {
        contextIcon = "⏱️"; // Stopwatch/Hours
    } else if (upperLabel.includes("COST")) {
        contextIcon = "📊"; // Analytics/Cost
    } else if (upperLabel.includes("CHECKLIST")) {
        contextIcon = "📋"; // Clipboard/Checklist
    } else if (upperLabel.includes("PERMIT")) {
        contextIcon = "📋"; // License/Permit card
    } else if (upperLabel.includes("ERROR") || upperLabel.includes("SYSTEM")) {
        contextIcon = "🚫"; // Error/Blocked
    }

    card.innerHTML = `
    <div class="icon-box ${status === 'success' ? 'cyan-border' : 'yellow-border'}">
      <div class="mini-icon" style="font-size: 18px; display: flex; align-items: center; justify-content: center;">
        ${contextIcon}
      </div>
    </div>
    <div class="item-info">
      <span class="item-label cyan-text">${upperLabel}</span>
      <span class="item-value">${value}</span>
    </div>
    <div class="status-icon ${status === 'success' ? 'green-text' : 'yellow-text'}">${statusIcon}</div>
  `;
    resultsContainer.appendChild(card);
}

// ------------------- Injected Scraper Script (Runs in SAP Tab) -------------------
function checkWorkOrderPage() {
    const results = [];
    const greenTick = "✅";
    const redCross = "❌";

    const sendResults = () => chrome.runtime.sendMessage({ type: "WORK_ORDER_RESULTS", results });

    function waitForElements(doc, selector, callback, timeout = 5000) {
        const start = Date.now();
        const interval = setInterval(() => {
            const elems = doc.querySelectorAll(selector);
            if (elems.length > 0) {
                clearInterval(interval);
                callback(elems);
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                callback([]);
            }
        }, 400);
    }
    const iframe = document.getElementById("application-IW32-display-iframe");
    if (!iframe) {
        results.push(`${redCross} System: Iframe Not Found`);
        return sendResults();
    }
    const doc = iframe.contentDocument || iframe.contentWindow.document;

    // --- HEADER CHECKS ---
    
    const sysStatus = doc.getElementById("M0:46:1:1:1::7:11");
    //system status check for material issuance
    // console.log("system status",sysStatus);
    if (!sysStatus) {
      results.push(`${redCross} Sys. Status not found`);
      // return false;
    }
    
    const status = sysStatus?.value?.trim() || "";
    console.log("status iss: ",status);
    
    if (status.includes("MACM")) {
        results.push(`${redCross} MR/PR created against this order DO NOT close: ${status}`);
        // return false;
    
    } else if (status.includes("NMAT")) {
        results.push(`${greenTick} No material created, Safe to TECO: ${status}`);
        // return true;
    
    } else if (status.includes("GMPS")) {
        results.push(`${greenTick} Material issued, Safe to TECO: ${status}`);
        // return true;
    
    } else {
        results.push(`${redCross} Material status could not be determined: ${status}`);
        // return false;
    }
    
    // results.push(!sysStatus?.value?.trim() ? `${redCross} System Status: Missing` : `${greenTick} System Status: ${sysStatus.value.trim()}`);

    const personal = doc.getElementById("M0:46:1:1:2:3B256:5:2::0:11");
    results.push(!personal?.value?.trim() ? `${redCross} Personal Num: Missing` : `${greenTick} Personal Num: ${personal.value.trim()}`);

    const firstOp = doc.getElementById("M0:46:1:1:2:3B256:10::4:12");
    results.push(!firstOp?.value?.trim() || firstOp.value === "0" ? `${redCross} First Operation Num: Missing` : `${greenTick} First Operation Num: ${firstOp.value.trim()}`);

    const equip = doc.getElementById("M0:46:1:1:2:3B256:8::1:11");
    results.push(!equip?.value?.trim() ? `${redCross} Equipment: Missing` : `${greenTick} Equipment: ${equip.value.trim()}`);

    // --- TAB CHAIN: OPERATIONS ---
    const opTab = doc.getElementById("M0:46:1:1:2::0:1-title");
    if (opTab) {
        opTab.click();
        waitForElements(doc, 'span[id*="tbl"][id*=",10]_c"]', (spans) => {
            results.push(spans.length === 0 ? `${redCross} Work Hrs: Missing` : `${greenTick} Work Hrs: ${spans[0].innerText.trim()}`);

            // --- TAB CHAIN: COST ---
            const costTab = doc.getElementById("M0:46:1:1:2::0:5-title");
            if (costTab) {
                costTab.click();
                waitForElements(doc, 'span[id*="tree#"][id*=" 8#i"], span[id*="tree#"][id*=" 7#i"]', (inputs) => {
                    const actualCostElem = Array.from(inputs).find(el => el.id.includes(" 8#i"));
                    const plannedCostElem = Array.from(inputs).find(el => el.id.includes(" 7#i"));
                    const actualCost = actualCostElem?.innerText?.trim() || "";
                    const plannedCost = plannedCostElem?.innerText?.trim() || "";

                    if (!actualCost || !plannedCost) {
                        results.push(`${redCross} Cost Data: Missing values`);
                    } else if (actualCost === plannedCost) {
                        results.push(`${redCross} Cost Data: Actual equals Planned`);
                    } else {
                        results.push(`${greenTick} Cost Data: Planned ${plannedCost} vs Actual ${actualCost}`);
                    }

                    // --- TAB CHAIN: ADDITIONAL DATA ---
                    const addDataTab = doc.getElementById("M0:46:1:1:2::0:8-title");
                    if (addDataTab) {
                        addDataTab.click();
                        waitForElements(doc, 'span[id*="1,11#if-r"]', (chkInputs) => {
                            const checklist = chkInputs[0]?.innerText?.trim();
                            results.push(!checklist ? `${redCross} Checklist: Missing attachment` : `${greenTick} Checklist: ${checklist}`);

                            // --- TAB CHAIN: PERMIT ---
                            const permitTab = doc.getElementById("M0:46:1:1:2::0:13-title");
                            if (permitTab) {
                                permitTab.click();
                                waitForElements(doc, 'input[id="M0:46:1:1:2:3B269:1::3:18"]', (permInputs) => {
                                    results.push(!permInputs[0]?.value ? `${redCross} Permit Num: Missing` : `${greenTick} Permit Num: ${permInputs[0].value}`);
                                    doc.getElementById("M0:46:1:1:2::0:0-title")?.click();
                                    setTimeout(sendResults, 600);
                                });
                            } else { sendResults(); }
                        });
                    } else { sendResults(); }
                });
            } else { sendResults(); }
        });
    } else { sendResults(); }
}




// ------------------- Injected Scraper Script -------------------
// (Keep your checkWorkOrderPage function exactly as it was in the previous step)

// // ------------------- Popup Script -------------------
// const checkBtn = document.getElementById("check");
// const resultsUl = document.getElementById("results");
// const spinner = document.getElementById("spinner");

// checkBtn.addEventListener("click", async () => {
//   // spinner.style.display = "block";
//   resultsUl.innerHTML = "";

//   // Get current active tab
//   let [currentTab] = await chrome.tabs.query({
//     active: true,
//     currentWindow: true,
//   });

//   // Check if user is on IW32-display page
//   if (currentTab.url.includes("IW32-display")) {
//     chrome.scripting.executeScript({
//       target: { tabId: currentTab.id },
//       function: checkWorkOrderPage,
//     });
//   } else {
//     showMessage("Not on IW-32 Page", "error");
//     spinner.style.display = "none";
//   }
// });

// // Receive results from injected script
// chrome.runtime.onMessage.addListener((msg) => {
//   if (msg.type === "WORK_ORDER_RESULTS") {
//     spinner.style.display = "none";
//     resultsUl.innerHTML = "";
//     msg.results.forEach((r) => {
//       const status = r.startsWith("✅") ? "success" : "error";
//       showMessage(r, status);
//     });
//   }
// });

// function showMessage(text, type) {
//   const li = document.createElement("li");
//   li.innerHTML = text;
//   li.className = type;
//   resultsUl.appendChild(li);
// }

// // ------------------- Injected Script -------------------
// function checkWorkOrderPage() {
//   const results = [];
//   const greenTick = "✅";
//   const redCross = "❌";

//   const sendResults = () =>
//     chrome.runtime.sendMessage({ type: "WORK_ORDER_RESULTS", results });

//   // Helper: wait for iframe
//   function waitForIframe(callback, timeout = 10000) {
//     const iframe = document.getElementById("application-IW32-display-iframe");
//     if (!iframe) {
//       results.push(`${redCross} Iframe not found`);
//       return sendResults();
//     }
//     const start = Date.now();
//     const checkInterval = setInterval(() => {
//       if (iframe.contentDocument?.readyState === "complete") {
//         clearInterval(checkInterval);
//         callback(iframe.contentDocument);
//       } else if (Date.now() - start > timeout) {
//         clearInterval(checkInterval);
//         results.push("⚠️ Iframe load timeout");
//         sendResults();
//       }
//     }, 500);
//   }

//   // Helper: wait for elements
//   function waitForElements(doc, selector, callback, timeout = 5000) {
//     const start = Date.now();
//     const checkInterval = setInterval(() => {
//       const elems = doc.querySelectorAll(selector);
//       if (elems.length > 0) {
//         clearInterval(checkInterval);
//         callback(elems);
//       } else if (Date.now() - start > timeout) {
//         clearInterval(checkInterval);
//         callback([]);
//       }
//     }, 500);
//   }

//   // ---- MAIN FLOW ----
//   waitForIframe((doc) => {
//     const headerTab = doc.getElementById("M0:46:1:1:2::0:0-title");
//     if (!headerTab) {
//       results.push(`${redCross} Header tab not found`);
//       return sendResults();
//     }

//     headerTab.click();

//     // Wait for header fields to load
//     waitForElements(
//       doc,
//       "#M0\\:46\\:1\\:1\\:2\\:3B256\\:5\\:2\\:\\:0\\:11",
//       () => {
//         // 1️⃣ Personal Number
//         const personal = doc.getElementById("M0:46:1:1:2:3B256:5:2::0:11");
//         results.push(
//           !personal?.value?.trim() || personal.value === "0"
//             ? `${redCross} Personal number missing`
//             : `${greenTick} Personal number: <b> ${personal.value.trim()}</b>`
//         );

//         // 2️⃣ First Operation Personal Number
//         const firstOp = doc.getElementById("M0:46:1:1:2:3B256:10::4:12");
//         results.push(
//           !firstOp?.value?.trim() || firstOp.value === "0"
//             ? `${redCross} First operation personal number missing`
//             : `${greenTick} First operation personal number: <b> ${firstOp.value.trim()} </b> `
//         );

//         // 3️⃣ Equipment Tag
//         const equip = doc.getElementById("M0:46:1:1:2:3B256:8::1:11");
//         results.push(
//           !equip?.value?.trim() || equip.value === "0"
//             ? `${redCross} Equipment tag missing`
//             : `${greenTick} Equipment tag: <b>  ${equip.value.trim()}  </b> `
//         );

//         // ➡ Move to Operations Tab
//         checkOperationsTab(doc);
//       }
//     );
//   });

//   // ---- Operations Tab ----
//   function checkOperationsTab(doc) {
//     const operationsTab = doc.getElementById("M0:46:1:1:2::0:1-title");
//     if (!operationsTab) {
//       results.push(`${redCross} Operations tab not found`);
//       return sendResults();
//     }

//     operationsTab.click();

//     waitForElements(
//       doc,
//       'span[id*="tbl"][id*=",10]_c"][class*="lsField__input"]',
//       (spans) => {
//         const hasMissing =
//           spans.length === 0 ||
//           Array.from(spans).some(
//             (s) => !s.innerText.trim() || s.innerText.trim() < "0.1"
//           );

//         results.push(
//           hasMissing
//             ? `${redCross} Actual work hrs missing`
//             : `${greenTick} Actual work hrs present: <b> ${spans[0].innerText.trim()}</b>`
//         );

//         // ➡ Move to Cost Tab
//         checkCostTab(doc);
//       }
//     );
//   }

//   // ---- Cost Tab ----
//   function checkCostTab(doc) {
//     const costTab = doc.getElementById("M0:46:1:1:2::0:5-title");
//     if (!costTab) {
//       results.push(`${redCross} Cost tab not found`);
//       return checkPermitTab(doc);
//     }

//     costTab.click();

//     waitForElements(
//       doc,
//       'span[id*="tree#"][id*=" 8#i"], span[id*="tree#"][id*=" 7#i"]',
//       (inputs) => {
//         if (inputs.length === 0) {
//           results.push(`${redCross} Cost values not found.`);
//         } else {
//           const actualCostElem = Array.from(inputs).find((el) =>
//             el.id.includes(" 8#i")
//           );
//           const plannedCostElem = Array.from(inputs).find((el) =>
//             el.id.includes(" 7#i")
//           );

//           const actualCost = actualCostElem?.innerText?.trim() || "";
//           const plannedCost = plannedCostElem?.innerText?.trim() || "";

//           if (!actualCost || !plannedCost) {
//             results.push(`${redCross} Missing planned or actual cost value.`);
//           } else if (actualCost === plannedCost) {
//             results.push(`${redCross} Actual and planned cost are the same.`);
//           } else {
//             results.push(
//               `${greenTick} Planned vs Actual cost OK (Planned:  <b> ${plannedCost}  </b> , Actual:  <b>  ${actualCost}) </b> `
//             );
//           }
//         }

//         // ➡ Move to Additional Data Tab
//         checkAdditionalDataTab(doc);
//       }
//     );
//   }

//   // ---- Additional Data Tab ----
//   function checkAdditionalDataTab(doc) {
//     const additionalDataTab = doc.getElementById("M0:46:1:1:2::0:8-title");
//     if (!additionalDataTab) {
//       results.push(`${redCross} Additional Data Tab tab not found`);
//       return checkPermitTab(doc);
//     }

//     additionalDataTab.click();

//     waitForElements(doc,'span[id*="1,11#if-r"]', (inputs) => {
//        if (inputs.length === 0) {
//           results.push(`${redCross} Checklist Row not found.`);
//         } else {
//           const checklistElement = Array.from(inputs).find((el) =>
//             el.id.includes("1,11#if-r")
//         );
//         console.log("Inputs is:",inputs);
//         console.log("checklist element is:",checklistElement);
//           const checklistTitle = checklistElement?.innerText?.trim() || "";

//           if (!checklistTitle) {
//             results.push(`${redCross} Missing Checklist .`);
//           } else {
//             results.push(
//               `${greenTick} Checklist Attached:  <b> ${checklistTitle}  </b> `
//             );
//           }
//         }
//       // ➡ Move to Permit Tab
//       checkPermitTab(doc);
//     });
//   }

//   // ---- Permit Tab ----
//   function checkPermitTab(doc) {
//     const permitTab = doc.getElementById("M0:46:1:1:2::0:13-title");
//     if (!permitTab) {
//       results.push(`${redCross} Permit tab not found.`);
//       return finishAtHeader(doc);
//     }

//     permitTab.click();

//     waitForElements(doc, 'input[id="M0:46:1:1:2:3B269:1::3:18"]', (inputs) => {
//       const permitVal = inputs[0]?.value?.trim();
//       results.push(
//         !permitVal
//           ? `${redCross} Enter permit number.`
//           : `${greenTick} Permit number: <b>  ${permitVal} </b> `
//       );

//       // ✅ After all checks, go back to Header tab
//       finishAtHeader(doc);
//     });
//   }

//   // ---- Return to Header ----
//   function finishAtHeader(doc) {
//     const headerTab = doc.getElementById("M0:46:1:1:2::0:0-title");
//     if (headerTab) {
//       setTimeout(() => {
//         headerTab.click();
//         console.log(`${greenTick} ↩️ Returned to Header tab after checks`);
//         sendResults();
//       }, 800); // small delay before clicking
//     } else {
//       results.push("⚠️ Could not return to Header tab");
//       sendResults();
//     }
//   }
// }



// ------------------------------------------------------------------------------------------------------------

/*
const checkBtn = document.getElementById("check");
const resultsUl = document.getElementById("results");
const spinner = document.getElementById("spinner");

checkBtn.addEventListener("click", async () => {
  spinner.style.display = "block";
  resultsUl.innerHTML = "";

  let [tab1] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab1.url.includes("IW32-display")) {
    chrome.scripting.executeScript({
      target: { tabId: tab1.id },
      function: checkWorkOrder,
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "Not on IW-32 Page";
    li.className = "error";
    resultsUl.appendChild(li);
    spinner.style.display = "none";
  }
});

// Receive results from the content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "WORK_ORDER_RESULTS") {
    spinner.style.display = "none";
    resultsUl.innerHTML = "";
    msg.results.forEach((r) => {
      const li = document.createElement("li");
      li.textContent = r;
      li.className = r.startsWith("✅") ? "success" : "error";
      resultsUl.appendChild(li);
    });
  }
});

// ------------------- Injected Function -------------------
function checkWorkOrder() {
  const results = [];
  const greenTick = "\u2705";
  const redCross = "\u274C";

  function sendResults() {
    chrome.runtime.sendMessage({ type: "WORK_ORDER_RESULTS", results });
  }

  function waitForIframe(callback, timeout = 10000) {
    const iframe = document.getElementById("application-IW32-display-iframe");
    if (!iframe) {
      results.push(`${redCross} Iframe not found`);
      return sendResults();
    }
    const start = Date.now();
    const timer = setInterval(() => {
      if (iframe.contentDocument?.readyState === "complete") {
        clearInterval(timer);
        callback(iframe.contentDocument);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        results.push("⚠️ Iframe load timeout");
        sendResults();
      }
    }, 500);
  }

  function waitForElements(doc, selector, callback, timeout = 5000) {
    const start = Date.now();
    const timer = setInterval(() => {
      const elems = doc.querySelectorAll(selector);
      if (elems.length > 0) {
        clearInterval(timer);
        callback(elems);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        callback([]);
      }
    }, 500);
  }

  waitForIframe((doc) => {
    // 1️⃣ Personal number
    const personal = doc.getElementById("M0:46:1:1:2:3B256:5:2::0:11");
    results.push(
      !personal || !personal.value.trim() || personal.value.trim() === "0"
        ? `${redCross} Personal number missing`
        : `${greenTick} Personal number: ${personal.value.trim()}`
    );

    // 2️⃣ First operation
    const firstOp = doc.getElementById("M0:46:1:1:2:3B256:10::4:12");
    results.push(
      !firstOp || !firstOp.value.trim() || firstOp.value.trim() === "0"
        ? `${redCross} First operation personal number missing`
        : `${greenTick} First operation personal number: ${firstOp.value.trim()}`
    );

    // 3️⃣ Equipment tag
    const equip = doc.getElementById("M0:46:1:1:2:3B256:8::1:11");
    results.push(
      !equip || !equip.value.trim() || equip.value.trim() === "0"
        ? `${redCross} Equipment tag missing`
        : `${greenTick} Equipment tag: ${equip.value.trim()}`
    );

    // 4️⃣ Operations tab
    const operationsTab = doc.getElementById("M0:46:1:1:2::0:1-title");
    if (operationsTab) {
      operationsTab.click();
      waitForElements(
        doc,
        'span[id*="tbl"][id*=",10]_c"][class*="lsField__input"]',
        (spans) => {
          const hasMissing =
            spans.length === 0 ||
            Array.from(spans).some(
              (s) => !s.innerText.trim() || s.innerText.trim() == 0
            );
          results.push(
            hasMissing
              ? `${redCross} Actual work hrs missing`
              : `${greenTick} Actual work hrs present: ${spans[0].innerText.trim()}`
          );
// 4️⃣ Cost tab
    const costTab = doc.getElementById("M0:46:1:1:2::0:5-title");
    if (costTab) {
      costTab.click();
      waitForElements(
          // tree#C109#1#3#C          7#i
        doc,
        'span[id*="tree"][id*="7#i"]',
        (spans) => {
          const hasMissing =
            spans.length === 0 ||
            Array.from(spans).some(
              (s) => !s.innerText.trim() || s.innerText.trim() == 0
            );
          results.push(
            hasMissing
              ? `${redCross} Actual work hrs missing`
              : `${greenTick} Actual work hrs present: ${spans[0].innerText.trim()}`
          );


                         // Wait before switching to Permit tab
          setTimeout(() => {
            const permitTab = doc.getElementById("M0:46:1:1:2::0:13-title");
            console.log("Permit tab element:", permitTab);

            if (permitTab) {
              console.log("Clicking Permit tab...");
              permitTab.click();

              // Wait for field to appear
              waitForElements(
                doc,
                'input[id="M0:46:1:1:2:3B269:1::3:18"]',
                (inputs) => {
                  const permitVal =
                    inputs.length > 0 ? inputs[0].value.trim() : null;
                  results.push(
                    !permitVal
                      ? `${redCross} Enter permit number`
                      : `${greenTick} Permit number: ${permitVal}`
                  );
                  sendResults();
                }
              );
            } else {
              results.push(`${redCross} Permit tab not found`);
              sendResults();
            }
          }, 3000); // wait 3 sec before clicking permit tab
        }
      );
    } else {
      results.push(`${redCross} Operations tab not found`);
      sendResults();
    }
  });
}
*/
