// ------------------- Popup Script -------------------
const checkBtn = document.getElementById("check");
const resultsUl = document.getElementById("results");
const spinner = document.getElementById("spinner");

checkBtn.addEventListener("click", async () => {
  spinner.style.display = "block";
  resultsUl.innerHTML = "";

  // Get current active tab
  let [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if user is on IW32-display page
  if (currentTab.url.includes("IW32-display")) {
    chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      function: checkWorkOrderPage,
    });
  } else {
    showMessage("Not on IW-32 Page", "error");
    spinner.style.display = "none";
  }
});

// Receive results from injected script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "WORK_ORDER_RESULTS") {
    spinner.style.display = "none";
    resultsUl.innerHTML = "";
    msg.results.forEach((r) => {
      const status = r.startsWith("✅") ? "success" : "error";
      showMessage(r, status);
    });
  }
});

function showMessage(text, type) {
  const li = document.createElement("li");
 li.innerHTML = text;
  li.className = type;
  resultsUl.appendChild(li);
}

// ------------------- Injected Script -------------------
function checkWorkOrderPage() {
  const results = [];
  const greenTick = "✅";
  const redCross = "❌";

  const sendResults = () =>
    chrome.runtime.sendMessage({ type: "WORK_ORDER_RESULTS", results });

  // Helper: wait for iframe
  function waitForIframe(callback, timeout = 10000) {
    const iframe = document.getElementById("application-IW32-display-iframe");
    if (!iframe) {
      results.push(`${redCross} Iframe not found`);
      return sendResults();
    }
    const start = Date.now();
    const checkInterval = setInterval(() => {
      if (iframe.contentDocument?.readyState === "complete") {
        clearInterval(checkInterval);
        callback(iframe.contentDocument);
      } else if (Date.now() - start > timeout) {
        clearInterval(checkInterval);
        results.push("⚠️ Iframe load timeout");
        sendResults();
      }
    }, 500);
  }

  // Helper: wait for elements
  function waitForElements(doc, selector, callback, timeout = 5000) {
    const start = Date.now();
    const checkInterval = setInterval(() => {
      const elems = doc.querySelectorAll(selector);
      if (elems.length > 0) {
        clearInterval(checkInterval);
        callback(elems);
      } else if (Date.now() - start > timeout) {
        clearInterval(checkInterval);
        callback([]);
      }
    }, 500);
  }

  // ---- MAIN FLOW ----
  waitForIframe((doc) => {
    const headerTab = doc.getElementById("M0:46:1:1:2::0:0-title");
    if (!headerTab) {
      results.push(`${redCross} Header tab not found`);
      return sendResults();
    }

    headerTab.click();

    // Wait for header fields to load
    waitForElements(doc, '#M0\\:46\\:1\\:1\\:2\\:3B256\\:5\\:2\\:\\:0\\:11', () => {
      // 1️⃣ Personal Number
      const personal = doc.getElementById("M0:46:1:1:2:3B256:5:2::0:11");
      results.push(
        !personal?.value?.trim() || personal.value === "0"
          ? `${redCross} Personal number missing`
          : `${greenTick} Personal number: <b> ${personal.value.trim()}</b>`
      );

      // 2️⃣ First Operation Personal Number
      const firstOp = doc.getElementById("M0:46:1:1:2:3B256:10::4:12");
      results.push(
        !firstOp?.value?.trim() || firstOp.value === "0"
          ? `${redCross} First operation personal number missing`
          : `${greenTick} First operation personal number: <b> ${firstOp.value.trim()} </b> `
      );

      // 3️⃣ Equipment Tag
      const equip = doc.getElementById("M0:46:1:1:2:3B256:8::1:11");
      results.push(
        !equip?.value?.trim() || equip.value === "0"
          ? `${redCross} Equipment tag missing`
          : `${greenTick} Equipment tag: <b>  ${equip.value.trim()}  </b> `
      );

      // ➡ Move to Operations Tab
      checkOperationsTab(doc);
    });
  });

  // ---- Operations Tab ----
  function checkOperationsTab(doc) {
    const operationsTab = doc.getElementById("M0:46:1:1:2::0:1-title");
    if (!operationsTab) {
      results.push(`${redCross} Operations tab not found`);
      return sendResults();
    }

    operationsTab.click();

    waitForElements(
      doc,
      'span[id*="tbl"][id*=",10]_c"][class*="lsField__input"]',
      (spans) => {
        const hasMissing =
          spans.length === 0 ||
          Array.from(spans).some(
            (s) => !s.innerText.trim() || s.innerText.trim() < "0.1"
          );

        results.push(
          hasMissing
            ? `${redCross} Actual work hrs missing`
            : `${greenTick} Actual work hrs present: <b> ${spans[0].innerText.trim()}</b>`
        );

        // ➡ Move to Cost Tab
        checkCostTab(doc);
      }
    );
  }

  // ---- Cost Tab ----
  function checkCostTab(doc) {
    const costTab = doc.getElementById("M0:46:1:1:2::0:5-title");
    if (!costTab) {
      results.push(`${redCross} Cost tab not found`);
      return checkPermitTab(doc);
    }

    costTab.click();

    waitForElements(
      doc,
      'span[id*="tree#"][id*=" 8#i"], span[id*="tree#"][id*=" 7#i"]',
      (inputs) => {
        if (inputs.length === 0) {
          results.push(`${redCross} Cost values not found.`);
        } else {
          const actualCostElem = Array.from(inputs).find((el) => el.id.includes(" 8#i"));
          const plannedCostElem = Array.from(inputs).find((el) => el.id.includes(" 7#i"));

          const actualCost = actualCostElem?.innerText?.trim() || "";
          const plannedCost = plannedCostElem?.innerText?.trim() || "";

          if (!actualCost || !plannedCost) {
            results.push(`${redCross} Missing planned or actual cost value.`);
          } else if (actualCost === plannedCost) {
            results.push(`${redCross} Actual and planned cost are the same.`);
          } else {
            results.push(
              `${greenTick} Planned vs Actual cost OK (Planned:  <b> ${plannedCost}  </b> , Actual:  <b>  ${actualCost}) </b> `
            );
          }
        }

        // ➡ Move to Permit Tab
        checkPermitTab(doc);
      }
    );
  }

  // ---- Permit Tab ----
  function checkPermitTab(doc) {
    const permitTab = doc.getElementById("M0:46:1:1:2::0:13-title");
    if (!permitTab) {
      results.push(`${redCross} Permit tab not found.`);
      return finishAtHeader(doc);
    }

    permitTab.click();

    waitForElements(doc, 'input[id="M0:46:1:1:2:3B269:1::3:18"]', (inputs) => {
      const permitVal = inputs[0]?.value?.trim();
      results.push(
        !permitVal
          ? `${redCross} Enter permit number.`
          : `${greenTick} Permit number: <b>  ${permitVal} </b> `
      );

      // ✅ After all checks, go back to Header tab
      finishAtHeader(doc);
    });
  }

  // ---- Return to Header ----
  function finishAtHeader(doc) {
    const headerTab = doc.getElementById("M0:46:1:1:2::0:0-title");
    if (headerTab) {
      setTimeout(() => {
        headerTab.click();
        console.log(`${greenTick} ↩️ Returned to Header tab after checks`);
        sendResults();
      }, 800); // small delay before clicking
    } else {
      results.push("⚠️ Could not return to Header tab");
      sendResults();
    }
  }
}






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