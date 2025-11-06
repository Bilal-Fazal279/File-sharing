chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "WORK_ORDER_RESULTS") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: displayResults,
        args: [msg.results]
      });
    });
  }
});

// Inject results into popup
function displayResults(results) {
  const ul = document.getElementById("results");
  if (!ul) return;
  ul.innerHTML = "";
  results.forEach(r => {
    const li = document.createElement("li");
    li.textContent = r;
    li.className = r.startsWith("✅") ? "success" : "error";
    ul.appendChild(li);
  });
}
