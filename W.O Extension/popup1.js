document.getElementById("check").addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: checkWorkOrder
  });
});

function checkWorkOrder() {
console.log("welcome to extension");
  const results = [];

  // 1️⃣  Personal number check
  const personal = document.getElementById("M0:46:1:1:2:3B256:5:2::0:11");
console.log("personal element is: ", personal);
  if (!personal || personal.value.trim() === "" || personal.value.trim() === "0")
    results.push("❌ Personal number missing");
  else
    results.push("✅ Personal number present");
/*

  // 2️⃣ First operation personal number
  const firstOp = document.getElementById("M0:46:1:1:2:3B256:10::4:12");
  if (!firstOp || firstOp.value.trim() === "" || firstOp.value.trim() === "0")
    results.push("❌ First operation personal number missing");
  else
    results.push("✅ First operation personal number present");

  // 3️⃣ Equipment tag
  const equip = document.getElementById("M0:46:1:1:2:3B256:5:2::0:11");
  if (!equip || equip.value.trim() === "" || equip.value.trim() === "0")
    results.push("❌ Equipment tag missing");
  else
    results.push("✅ Equipment tag present");


// 4️⃣ Check span IDs that contain "tbl" and ",10]_c" and actual hrs present Check


const operations = document.getElementById("M0:46:1:1:2::0:1-title");
if (operations) {
  operations.click();
  console.log("Clicked Operations tab");

  // Wait for elements to appear
  waitForElements('span[id*="tbl"][id*=",10]_c"][class*="lsField__input"]', checkSpans);
} else {
  console.log("❌ Operations tab not found!");
}

// --- Helper function: wait until selector is found ---
function waitForElements(selector, callback, timeout = 5000) {
  const start = Date.now();
  const timer = setInterval(() => {
    const elems = document.querySelectorAll(selector);
    if (elems.length > 0) {
      clearInterval(timer);
      callback(elems);
    } else if (Date.now() - start > timeout) {
      clearInterval(timer);
      console.log("⚠️ Timeout waiting for elements to load.");
      callback([]);
    }
  }, 500);
}

// --- Your checking logic ---
function checkSpans(spans) {
  console.log("Spans found:", spans.length);

  let hasMissing = false;

  spans.forEach(s => {
    let val = s.innerText.trim();
    console.log(s.id, "=", val);

    if (val == 0 || val === "") {
      hasMissing = true;
    }
  });

  if (spans.length === 0 || hasMissing) {
    results.push("❌ Actual work hrs missing");
    console.log("Inside IF body");
  } else {
    results.push("✅ Actual work hrs present");
  }

  console.log("Results:", results);
}
*/

  console.log(results.join("\n"));
}
