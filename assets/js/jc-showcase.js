/**
 * Fill in the showcase with the template identified by the search value.
 * Called by the search bar.
 * @param e {Event}
 */
function showcaseJC(e) {
    const showcase = document.getElementById(e.currentTarget.dataset.showcaseId);
    const templateName = e.currentTarget.value;

    const template = document.getElementById(templateName);

    if(!template || !showcase)
        return;

    showcase.innerHTML = "";
    showcase.classList.remove('placeholder');

    showcase.appendChild(
        document.importNode(template.content, true)
    );

    if(window.location.hash.substr(1) !== decodeURIComponent(e.currentTarget.value))
        window.location.hash = "#" + decodeURIComponent(e.currentTarget.value);
}

const searchBar = document.getElementById("jcSearch");

// Override value with search string if it exists
if(window.location.hash) {
    searchBar.value = decodeURIComponent(window.location.hash.substr(1));
}

// Activate the change for the first value
searchBar.dispatchEvent(new Event("change"));

// Tell search bar to update when hash updates
window.addEventListener('hashchange', function() {
    searchBar.value = decodeURIComponent(window.location.hash.substr(1));
    searchBar.dispatchEvent(new Event("change"));
});