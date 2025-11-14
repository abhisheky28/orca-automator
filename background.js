// --- Configuration ---
const SPREADSHEET_ID = '1M2Ya27j5pC9xni6VBJvW-I3cVaPRsrFaM2Vp2LJSE_E';
const RANGE = 'Data!A:ZZ';
const ORCA_ADD_URL = 'https://orca.myntra.com/adseo/pagerule/add/';

// --- State Management ---
let state = {
    isAutomating: false,
    tabId: null,
    allRows: [],
    currentIndex: -1,
    failedRows: [],
    statusText: "Ready to start."
};

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_AUTOMATION' && !state.isAutomating) {
        state.isAutomating = true;
        startAutomationProcess();
    } else if (message.type === 'RESET_AUTOMATION') {
        resetAutomation();
    } else if (message.type === 'GET_STATUS') {
        updatePopupStatus(state.statusText, state.failedRows);
    } else if (message.type === 'IMMEDIATE_FAILURE') {
        // This is for the rare case where the page doesn't reload (e.g., duplicate error)
        recoverAndContinue(message.keyword);
    }
});

// --- The Core Automation Trigger ---
const handleTabUpdate = (tabId, changeInfo, tab) => {
    // Check if our target tab has finished loading and is on the correct URL
    if (tabId === state.tabId && changeInfo.status === 'complete' && tab.url.startsWith(ORCA_ADD_URL)) {
        // If automation is running, this reload means the previous row was a success.
        if (state.isAutomating) {
            console.log("Page successfully reloaded. Processing next row.");
            processNextRow();
        }
    }
};

async function startAutomationProcess() {
    updatePopupStatus("Starting...");
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
        updatePopupStatus("Error: No active tab found.");
        resetAutomation();
        return;
    }
    state.tabId = tabs[0].id;

    // Start listening for tab updates. This is our main trigger.
    if (!chrome.tabs.onUpdated.hasListener(handleTabUpdate)) {
        chrome.tabs.onUpdated.addListener(handleTabUpdate);
    }

    // Fetch data in the background first
    try {
        const token = await getAuthToken();
        const sheetData = await fetchSheetData(token);
        state.allRows = processSheetData(sheetData.values);
        if (state.allRows.length === 0) throw new Error("No data found in Sheet.");
        console.log(`Found ${state.allRows.length} rows to process.`);
        state.currentIndex = -1; // Start at -1, so the first call increments to 0
        
        // Now that data is ready, navigate to the starting URL. 
        // The onUpdated listener will handle the first row.
        await chrome.tabs.update(state.tabId, { url: ORCA_ADD_URL });

    } catch (error) {
        console.error("Failed to fetch data:", error);
        updatePopupStatus(`Error: ${error.message}`);
        resetAutomation();
    }
}

function processNextRow() {
    if (!state.isAutomating) return;

    state.currentIndex++;
    if (state.currentIndex >= state.allRows.length) {
        let finalText = `Automation Complete! ${state.allRows.length} rows processed.`;
        if (state.failedRows.length > 0) {
            finalText += ` (${state.failedRows.length} failed).`;
            console.log("--- FAILED KEYWORDS ---");
            console.log(state.failedRows.join('\n'));
        }
        updatePopupStatus(finalText, state.failedRows);
        resetAutomation();
        return;
    }

    const rowData = state.allRows[state.currentIndex];
    updatePopupStatus(`Processing row ${state.currentIndex + 1} of ${state.allRows.length}...`);
    
    // Inject the worker script and send it the data for the current row.
    chrome.scripting.executeScript({
        target: { tabId: state.tabId },
        files: ['content_script.js']
    }).then(() => {
        chrome.tabs.sendMessage(state.tabId, { type: 'FILL_FORM', data: rowData });
    }).catch(err => {
        console.error("Failed to inject script. Triggering recovery.", err);
        recoverAndContinue(rowData.Keyword || 'Unknown Keyword');
    });
}

function resetAutomation() {
    chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    state = { isAutomating: false, tabId: null, allRows: [], currentIndex: -1, failedRows: [], statusText: "Reset. Ready to start." };
    updatePopupStatus(state.statusText);
    console.log("Automation has been reset.");
}

async function recoverAndContinue(failedKeyword) {
    console.warn(`Recovery triggered for keyword: ${failedKeyword}.`);
    state.failedRows.push(failedKeyword);
    // The recovery is now simple: just process the next row.
    // The tab update listener will take care of the rest once the new tab loads.
    processNextRow();
}

// --- HELPER FUNCTIONS (These were missing before) ---

function updatePopupStatus(text, failures = []) {
    state.statusText = text;
    chrome.runtime.sendMessage({ type: 'UPDATE_STATUS', text: state.statusText, failures });
}

async function getAuthToken() {
    const currentToken = await chrome.identity.getAuthToken({ interactive: false }).catch(() => null);
    if (currentToken) {
        await chrome.identity.removeCachedAuthToken({ token: currentToken.token });
    }
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError || !token) {
                reject(new Error(chrome.runtime.lastError?.message || "Could not get auth token."));
            } else {
                resolve(token);
            }
        });
    });
}

async function fetchSheetData(token) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google Sheets API error: ${errorData.error.message}`);
    }
    return response.json();
}

function processSheetData(rows) {
    if (!rows || rows.length < 2) return [];
    const headers = rows[0];
    const data = rows.slice(1);
    return data.map(row => {
        const rowObject = {};
        headers.forEach((header, index) => {
            rowObject[header.trim()] = row[index] || '';
        });
        return rowObject;
    });
}