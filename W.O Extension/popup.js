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
