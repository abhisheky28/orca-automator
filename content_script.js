// --- START OF FILE content_script.js ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FILL_FORM') {
        (async () => {
            try {
                await fillAndSubmitForm(message.data);
            } catch (err) {
                console.error("A critical error occurred in content script:", err);
                chrome.runtime.sendMessage({ 
                    type: 'IMMEDIATE_FAILURE', 
                    keyword: message.data.Keyword || 'Unknown' 
                });
            }
        })();
    }
});

const humanLikeDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const setInputValueAndDispatchEvents = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
        element.value = value || '';
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
};

async function fillAndSubmitForm(data) {
    // --- Fill Main Form Data ---
    setInputValueAndDispatchEvents('id_is_active', 'True');
    setInputValueAndDispatchEvents('id_page_type', '1');
    setInputValueAndDispatchEvents('id_url', data.URl);
    setInputValueAndDispatchEvents('id_canonical', data.Canonical);
    setInputValueAndDispatchEvents('id_pagewidget-0-head_title', data.title);
    setInputValueAndDispatchEvents('id_pagewidget-0-head_meta_description', data.description);
    setInputValueAndDispatchEvents('id_pagewidget-0-head_meta_keywords', data.keywords);
    setInputValueAndDispatchEvents('id_pagebodywidget-0-page_title', data.PageTitle);
    await humanLikeDelay(100);

    // --- NEW: Set a limit for the number of links to add in one go ---
    const LINK_SUBMISSION_LIMIT = 51; 

    // --- Footer Link Logic with the new limit ---
    let linksAdded = 0;
    for (let i = 0; i < 51; i++) { // Still loop through all possible columns
        if (linksAdded >= LINK_SUBMISSION_LIMIT) {
            console.log(`Reached submission limit of ${LINK_SUBMISSION_LIMIT}. The rest will need to be added manually for now.`);
            break; // Stop adding more links
        }

        const anchorKey = `Anchor ${i + 1}`;
        const linkKey = `Link ${i + 1}`;
        if (!data[anchorKey] && !data[linkKey]) continue;

        if (i >= 5) {
            const addLinkButton = document.querySelector('#pagefooter_set-group .add-row a');
            if (addLinkButton) {
                addLinkButton.click();
                await humanLikeDelay(250); 
            } else {
                console.error(`Could not find "Add another" button for link #${i + 1}.`);
                break;
            }
        }
        setInputValueAndDispatchEvents(`id_pagefooter_set-${i}-link_name`, data[anchorKey]);
        setInputValueAndDispatchEvents(`id_pagefooter_set-${i}-link_url`, data[linkKey]);
        setInputValueAndDispatchEvents(`id_pagefooter_set-${i}-type`, '1');
        
        linksAdded++;
    }

    // --- Submit the Form ---
    console.log("Submitting form with a limited number of links for:", data.Keyword);
    const submitButton = document.querySelector('input[type="submit"][name="_addanother"]');
    if (submitButton) {
        submitButton.click();
    } else {
        throw new Error("Could not find the 'Save and add another' button.");
    }

    // --- Check for IMMEDIATE error ---
    await new Promise(resolve => setTimeout(resolve, 1200)); 
    const errorNote = document.querySelector('.errornote');
    if (errorNote) {
        console.error(`IMMEDIATE failure detected for Keyword: "${data.Keyword}". Reporting back.`);
        chrome.runtime.sendMessage({ 
            type: 'IMMEDIATE_FAILURE', 
            keyword: data.Keyword 
        });
    }
}