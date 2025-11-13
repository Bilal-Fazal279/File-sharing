console.log("Content script loaded ✅");

const greenTick = "✅";
const redCross = "❌";
const results = [];

// Keep track of the current listener and iframe
let currentCompleteListener = null;
let currentIframe = null;

function sendResults() {
  chrome.runtime.sendMessage({ type: "WORK_ORDER_RESULTS", results });
}

// ---------- Wait helpers ----------

function waitForShellButton(timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const shellBtn = document.querySelector('[id*="shellAppTitle-button"]');
      if (shellBtn && shellBtn.title.includes("Change Scheduled Based")) {
        console.log("✅ Shell button found with correct title");
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject("Shell button not found or title mismatch");
      }
    }, 500);
  });
}

function waitForIframe(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const iframe = document.getElementById("application-IW32-display-iframe");
      if (iframe?.contentDocument?.readyState === "complete") {
        console.log("✅ SAP iframe loaded");
        clearInterval(interval);
        resolve(iframe.contentDocument);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject("Iframe not loaded in time");
      }
    }, 500);
  });
}

function waitForElements(doc, selector, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elems = doc.querySelectorAll(selector);
      if (elems.length > 0) {
        clearInterval(interval);
        resolve(elems);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        resolve([]);
      }
    }, 500);
  });
}

// ---------- Core Validation ----------

async function runAllChecks(doc) {
  results.length = 0;
  console.log("▶ Running all validation checks...");

  const personal = doc.getElementById("M0:46:1:1:2:3B256:5:2::0:11");
  const firstOp = doc.getElementById("M0:46:1:1:2:3B256:10::4:12");
  const equip = doc.getElementById("M0:46:1:1:2:3B256:8::1:11");

  results.push(!personal?.value?.trim() || personal.value === "0"
    ? `${redCross} Personal number missing`
    : `${greenTick} Personal number OK`);
  results.push(!firstOp?.value?.trim() || firstOp.value === "0"
    ? `${redCross} First operation missing`
    : `${greenTick} First operation OK`);
  results.push(!equip?.value?.trim() || equip.value === "0"
    ? `${redCross} Equipment tag missing`
    : `${greenTick} Equipment OK`);

  // Operations Tab
  const operationsTab = doc.getElementById("M0:46:1:1:2::0:1-title");
  if (!operationsTab) { results.push(`${redCross} Operations tab not found`); return false; }
  operationsTab.click();

  const spans = await waitForElements(doc, 'span[id*="tbl"][id*=",10]_c"][class*="lsField__input"]');
  const hasMissing = spans.length === 0 || Array.from(spans).some(s => !s.innerText.trim() || s.innerText.trim() === "0");
  results.push(hasMissing ? `${redCross} Actual work hrs missing` : `${greenTick} Work hrs OK`);

  // Cost Tab
  const costTab = doc.getElementById("M0:46:1:1:2::0:5-title");
  if (!costTab) { results.push(`${redCross} Cost tab not found`); return false; }
  costTab.click();

  const costInputs = await waitForElements(doc, 'span[id*="tree#"][id*=" 8#i"], span[id*="tree#"][id*=" 7#i"]');
  const actualCost = Array.from(costInputs).find(el => el.id.includes(" 8#i"))?.innerText?.trim();
  const plannedCost = Array.from(costInputs).find(el => el.id.includes(" 7#i"))?.innerText?.trim();

  if (!actualCost || !plannedCost) results.push(`${redCross} Missing planned/actual cost`);
  else if (actualCost === plannedCost) results.push(`${redCross} Actual = Planned cost`);
  else results.push(`${greenTick} Cost OK`);

  // Permit Tab
  const permitTab = doc.getElementById("M0:46:1:1:2::0:13-title");
  if (!permitTab) { results.push(`${redCross} Permit tab not found`); return false; }
  permitTab.click();

  const permitInputs = await waitForElements(doc, 'input[id="M0:46:1:1:2:3B269:1::3:18"]');
  const permitVal = permitInputs[0]?.value?.trim();
  results.push(!permitVal ? `${redCross} Permit number missing` : `${greenTick} Permit OK`);

  // Return to Header tab
  finishAtHeader(doc);

  return !results.some(r => r.startsWith(redCross));
}

function finishAtHeader(doc) {
  const headerTab = doc.getElementById("M0:46:1:1:2::0:0-title");
  if (headerTab) {
    setTimeout(() => {
      headerTab.click();
      results.push("↩️ Returned to Header tab after checks");
      sendResults();
    }, 800);
  } else {
    results.push("⚠️ Could not return to Header tab");
    sendResults();
  }
}

// ---------- Hook Technical Complete ----------

async function hookTechnicalCompleteButton(doc) {
  const completeBtn = doc.querySelector('div[id*="M0:48::btn[36]"]');
  if (!completeBtn) return;

  // Remove previous listener if same iframe
  if (currentCompleteListener && currentIframe === doc) {
    completeBtn.removeEventListener("mousedown", currentCompleteListener, true);
    console.log("🗑 Removed previous listener");
  }

  currentIframe = doc;

  currentCompleteListener = async (e) => {
    const target = e.target.closest('div[id*="M0:48::btn[36]"]');
    if (!target) return;

    e.stopImmediatePropagation();
    e.preventDefault();

    results.push("⚙️ Checking before Technical Completion...");
    sendResults();

    const passed = await runAllChecks(doc);
    sendResults();

    if (passed) {
      alert("✅ All checks passed! Proceeding to Technical Complete...");

      // Remove this listener so next click works normally
      target.removeEventListener("mousedown", currentCompleteListener, true);
      console.log("✅ Listener removed after successful checks");

      // Dispatch click so SAP can handle it
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    } else {
      alert("❌ Please fix the issues before completing technically.\nChecks:\n" + results.join("\n"));
    }
  };

  completeBtn.addEventListener("mousedown", currentCompleteListener, true);
  console.log("🔗 Listener attached for Technical Complete");
  results.push("🔗 Technical Complete button hook installed");
  sendResults();
}

// ---------- MutationObserver for new work orders ----------

function observeNewWorkOrder() {
  const observer = new MutationObserver(async (mutations) => {
    for (let mutation of mutations) {
      for (let node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const iframe = node.querySelector("#application-IW32-display-iframe") || 
                       document.getElementById("application-IW32-display-iframe");
        if (iframe?.contentDocument?.readyState === "complete") {
          console.log("🚀 New work order detected, hooking listener...");
          await hookTechnicalCompleteButton(iframe.contentDocument);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log("🔍 MutationObserver installed to detect new work orders");
}

// ---------- Entry point ----------

(async function() {
  try {
    console.log("🚀 Waiting for SAP shell and iframe...");
    await waitForShellButton();
    const sapDoc = await waitForIframe();
    await hookTechnicalCompleteButton(sapDoc);

    // Start observing new work orders dynamically
    observeNewWorkOrder();
  } catch (err) {
    console.log("❌ Content.js error:", err);
    results.push(`${redCross} ${err}`);
    sendResults();
  }
})();


// ----------------------------------------------------------------------------------------------------
// // content.js

// console.log("⚡ Work Order Checker content.js loaded");

// function checkWorkOrderPage() {
//   const greenTick = "✅";
//   const redCross = "❌";
//   const results = [];

//   const sendResults = () => {
//     console.log("Sending results:", results);
//     chrome.runtime.sendMessage({ type: "WORK_ORDER_RESULTS", results });
//   };

//   // ------------------- Helpers -------------------
//   function waitForIframe(callback, timeout = 15000) {
//     const start = Date.now();
//     const interval = setInterval(() => {
//       const iframe = document.getElementById("application-IW32-display-iframe");
//       console.log("Checking iframe:", iframe);
//       if (iframe && iframe.contentDocument?.readyState === "complete") {
//         clearInterval(interval);
//         callback(iframe.contentDocument);
//       } else if (Date.now() - start > timeout) {
//         clearInterval(interval);
//         results.push(`${redCross} Iframe not found or load timeout`);
//         sendResults();
//       }
//     }, 500);
//   }

//   function waitForElements(doc, selector, callback, timeout = 5000) {
//     const start = Date.now();
//     const interval = setInterval(() => {
//       const elems = doc.querySelectorAll(selector);
//       console.log(
//         "Checking elements for selector:",
//         selector,
//         "found:",
//         elems.length
//       );
//       if (elems.length > 0) {
//         clearInterval(interval);
//         callback(elems);
//       } else if (Date.now() - start > timeout) {
//         clearInterval(interval);
//         console.warn(`Timeout waiting for elements: ${selector}`);
//         callback([]);
//       }
//     }, 500);
//   }

//   function runAllChecks(doc, callback) {
//     try {
//       results.length = 0;

//       console.log("Running all checks...");

//       const personal = doc.getElementById("M0:46:1:1:2:3B256:5:2::0:11");
//       console.log("Personal element:", personal);
//       results.push(
//         !personal?.value?.trim() || personal.value === "0"
//           ? `${redCross} Personal number missing`
//           : `${greenTick} Personal number OK`
//       );

//       const firstOp = doc.getElementById("M0:46:1:1:2:3B256:10::4:12");
//       results.push(
//         !firstOp?.value?.trim() || firstOp.value === "0"
//           ? `${redCross} First operation missing`
//           : `${greenTick} First operation OK`
//       );

//       const equip = doc.getElementById("M0:46:1:1:2:3B256:8::1:11");
//       results.push(
//         !equip?.value?.trim() || equip.value === "0"
//           ? `${redCross} Equipment tag missing`
//           : `${greenTick} Equipment tag OK`
//       );

//       const operationsTab = doc.getElementById("M0:46:1:1:2::0:1-title");
//       console.log("Operations tab:", operationsTab);
//       if (!operationsTab) {
//         results.push(`${redCross} Operations tab not found`);
//         sendResults();
//         return callback(false);
//       }

//       operationsTab.click();

//       waitForElements(
//         doc,
//         'span[id*="tbl"][id*=",10]_c"][class*="lsField__input"]',
//         (spans) => {
//           console.log("Work hours spans:", spans);
//           const hasMissing =
//             spans.length === 0 ||
//             Array.from(spans).some(
//               (s) => !s.innerText.trim() || s.innerText.trim() === "0"
//             );
//           results.push(
//             hasMissing
//               ? `${redCross} Actual work hours missing`
//               : `${greenTick} Work hours OK`
//           );

//           const costTab = doc.getElementById("M0:46:1:1:2::0:5-title");
//           console.log("Cost tab:", costTab);
//           if (!costTab) {
//             results.push(`${redCross} Cost tab not found`);
//             sendResults();
//             return callback(false);
//           }

//           costTab.click();

//           waitForElements(
//             doc,
//             'span[id*="tree#"][id*=" 8#i"], span[id*="tree#"][id*=" 7#i"]',
//             (inputs) => {
//               console.log("Cost inputs:", inputs);
//               const actual = Array.from(inputs)
//                 .find((el) => el.id.includes(" 8#i"))
//                 ?.innerText?.trim();
//               const planned = Array.from(inputs)
//                 .find((el) => el.id.includes(" 7#i"))
//                 ?.innerText?.trim();
//               console.log("Actual:", actual, "Planned:", planned);

//               if (!actual || !planned) {
//                 results.push(`${redCross} Planned or actual cost missing`);
//               } else if (actual === planned) {
//                 results.push(`${redCross} Actual = Planned cost`);
//               } else {
//                 results.push(`${greenTick} Cost OK`);
//               }

//               const permitTab = doc.getElementById("M0:46:1:1:2::0:13-title");
//               console.log("Permit tab:", permitTab);
//               if (!permitTab) {
//                 results.push(`${redCross} Permit tab not found`);
//                 sendResults();
//                 return callback(false);
//               }

//               permitTab.click();

//               waitForElements(
//                 doc,
//                 'input[id="M0:46:1:1:2:3B269:1::3:18"]',
//                 (inputs) => {
//                   console.log("Permit inputs:", inputs);
//                   const permitVal = inputs[0]?.value?.trim();
//                   results.push(
//                     !permitVal
//                       ? `${redCross} Permit number missing`
//                       : `${greenTick} Permit OK`
//                   );

//                   const allGood = !results.some((r) => r.startsWith(redCross));
//                   callback(allGood);
//                 }
//               );
//             }
//           );
//         }
//       );
//     } catch (err) {
//       console.error("Error in runAllChecks:", err);
//       results.push(`${redCross} Error during checks: ${err.message}`);
//       sendResults();
//       callback(false);
//     }
//   }

//   // ------------------- Hook Technical Complete -------------------
//   waitForIframe((doc) => {
//     const shellBtn = doc.querySelector('[id*="shellAppTitle-button"]');
//     if (shellBtn && shellBtn.title.includes("Change Scheduled Based")) {
//       console.log("title includes change maintenance........");

//       try {
//         const completeBtn =
//           doc.querySelector('div[title*="Complete (technically)"]') ||
//           doc.querySelector('div[aria-label*="Technical Complete"]') ||
//           doc.querySelector('div[id*="M0:48::btn[36]"]');

//         console.log("Technical Complete button:", completeBtn);
//         if (!completeBtn) {
//           results.push(`${redCross} Technical Complete button not found`);
//           sendResults();
//           return;
//         }

//         if (completeBtn.dataset.listenerAdded) return;
//         completeBtn.dataset.listenerAdded = "true";

//         completeBtn.addEventListener("click", (e) => {
//           e.stopImmediatePropagation();
//           e.preventDefault();
//           console.log("Technical Complete clicked");

//           results.push("⚙️ Running pre-checks...");

//           runAllChecks(doc, (passed) => {
//             sendResults();

//             if (passed) {
//               alert("✅ All checks passed! Proceeding...");
//               completeBtn.click = null;
//               completeBtn.dispatchEvent(
//                 new MouseEvent("click", { bubbles: true })
//               );
//             } else {
//               alert("❌ Fix issues before completing technically.");
//             }
//           });
//         });

//         results.push("🔗 Technical Complete button hooked successfully");
//         sendResults();
//       } catch (err) {
//         console.error("Error hooking Technical Complete button:", err);
//         results.push(
//           `${redCross} Error hooking Technical Complete button: ${err.message}`
//         );
//         sendResults();
//       }
//      } else {
//       console.log("title DOES NOT includes change maintenance........");
//      }
//   });
// }

// // Auto-run
// try {
//   checkWorkOrderPage();
// } catch (err) {
//   console.error("Error executing checkWorkOrderPage:", err);
// }
