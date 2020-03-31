function updateResourceList(elm = null) {
    if(!(elm instanceof HTMLElement))
        elm = document.getElementById("resource-list");
    if(!elm) {
        console.error("Cannot write resource list to unknown element.");
    }

    // Train yourself
    fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vRfhd2a-La6LE7jQ2ibm_5GYz_vTS7gu2YpP4dAMD0HFKXANPbqIJ-3fbpQfcva0hpUVf4AZ9etDWmw/pub?gid=0&single=true&output=tsv")
        .then(r => r.text())
        .then(tsv => TSVtoJSON(tsv))
        .then(json => elm.innerHTML = makeResourceList(json).outerHTML);
}

/**
 * Map TSV representation of a Google Sheets document to JSON
 * @param tsv {string} tab-separated values
 * @return {Object}
 */
function TSVtoJSON(tsv) {
    const tsvRows = tsv.split('\n');
    const tsvCells = tsvRows.map(row => row.split('\t'));
    const json = {};
    for(let c = 0; c < tsvCells[0].length; c++) {
        const value = [];
        for(let r = 1; r < tsvCells.length; r++)
            value.push(tsvCells[r][c]);
        json[tsvCells[0][c]] = value;
    }
    return json;
}

/**
 * Map JSON'd Google Sheets data to a nice presentation form.
 * @param json {Object} JSON data from Google Sheets
 * @return {HTMLElement}
 */
function makeResourceList(json) {
    const section = document.createElement('section');
    section.classList.add("resources");
    for(let i = 1; i < json[Object.keys(json)[0]].length; i++) {
        const x = [];
        let blank = true;
        for(const k in json) {
            if(blank && /\w/.test(json[k][i]))
                blank = false;
            x.push(json[k][i]);
        }
        if(blank)
            continue;
        const item = section.appendChild(document.createElement('div'));
        item.classList.add('item');
        const head = item.appendChild(document.createElement('header'));
        if(/\w/.test(x[0]) || /\w/.test(x[2])) {
            const topic = head.appendChild(document.createElement('h1'));
            topic.classList.add('topic');
            const status = x[3].match(/(recorded|live|static)/i);
            if(status) {
                topic.classList.add(status[0].toLowerCase()); // Status as a class
                topic.title = status[0][0].toUpperCase() + status[0].substr(1).toLowerCase();
            }
            const a = topic.appendChild(document.createElement('a'));
            a.href = x[2];
            if(/\w/.test(x[0]))
                a.innerHTML = x[0] +
                    (/^https:\/\/reproducibiliTea.org/i.test(x[0])?
                        '' : ' <sup><i class="fas fa-external-link-alt"></i></sup>');
            else
                a.innerHTML = x[2];
        }
        if(/\w/.test(x[1])) {
            const author = head.appendChild(document.createElement('h2'));
            author.classList.add('author');
            author.innerHTML = x[1];
        }
        const body = item.appendChild(document.createElement('div'));
        if(/\w/.test(x[4])) {
            const details = body.appendChild(document.createElement('div'));
            details.classList.add('details');
            details.innerHTML = x[4];
        }
        if(/\w/.test(x[8])) {
            const notes = body.appendChild(document.createElement('div'));
            notes.classList.add('notes');
            notes.innerHTML = x[8];
        }
        if(/[\w\d]/.test(x[5]) || /[\w\d]/.test(x[6])) {
            const time = body.appendChild(document.createElement('div'));
            time.classList.add('time');
            let sep = '';
            if(/[\w\d]/.test(x[5]) && /[\w\d]/.test(x[6]))
                sep = '<div class="separator">-</div>';
            time.innerHTML = '<i class="fas fa-calendar fa-2x"></i> <div class="start">' + x[5] + '</div>' + sep + '<div class="end">' + x[6] + '</div>';
        }
        if(/\w/.test(x[7])) {
            const contact = body.appendChild(document.createElement('div'));
            contact.classList.add('contact');
            contact.innerHTML = x[7];
        }
    }
    return section;
}

updateResourceList();
