/**
 Functions for operating the join form page
 */

/**
 * Let the user stick a pin in Google Maps and fetch the geolocation of the pin
 * @param e {Event}
 */
function geolocate(e) {
    e.preventDefault();
    document.querySelector('#geolocation-map').classList.add('active');
    return false;
}

/**
 * Close the map and go back to the form
 * @param e {Event}
 */
function setGeolocation(e) {
    e.preventDefault();
    document.querySelector('#geolocation-map').classList.remove('active');
    return false;
}

/**
 * Update the geolocation field when the postal address is updated
 */
function geolocateAddress() {
    const address = document.getElementById('post');
    const addr = address.value.replace(/\s/g, '+');
    const input = document.getElementById('geolocation');
    const key = document.getElementById('APIkeys').dataset.maps;

    // Try to fetch the address
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${addr}&key=${key}`)
        .then(r => r.json())
        .then(j => {
            if(!j.results ||
                !j.results[0] ||
                !j.results[0].geometry ||
                !j.results[0].geometry.location)
                throw "No geometry or geometry.location in response.";
            input.value = `${j.results[0].geometry.location.lat}, ${j.results[0].geometry.location.lng}`;
        })
        .catch(
            (err) => {
                console.warn(`Failed to geolocate ${addr}: ${err}`);
                input.placeholder = "Use button to locate >>";
            }
        )
}

/**
 * Add a new organiser field below the current latest one
 * @param e {Event} button click event
 * @return {boolean}
 */
function addNewEntry(e) {
    const last = e.target.parentElement.querySelector('input:last-of-type');

    let id = -1;

    // Check whether the previous entry ends in a number
    if(/[0-9]+$/.test(last.name)) {
        // Find the ID of the latest entry
        const regex = /([0-9]+$)/.exec(last.id);
        if(regex[1])
            id = parseInt(regex[1]);
    }

    let newEntry = document.createElement('input');
    newEntry.type = 'text';
    newEntry.classList.add('optional');
    newEntry.id = e.target.dataset.fieldId + (id + 1);
    newEntry.name = newEntry.id;
    newEntry.placeholder = e.target.dataset.fieldPlaceholder + ' #' + (id + 2);

    last.parentElement.insertBefore(newEntry, last.nextSibling);

    // no submit action
    e.preventDefault();
    return false;
}

/**
 * Check form and update visuals for failed areas
 * @param e {Element|Event} form to check, or event sent by that form
 * @param allowEmpty {boolean} whether to mark empty responses as invalid
 * @return {boolean}
 */
function checkForm(e, allowEmpty = false) {
    let form;

    if(e instanceof Event) {
        form = e.currentTarget;
    } else {
        form = e;
    }

    // All form entries lose starting and trailing spaces
    form.querySelectorAll('input').forEach(e => {
        e.value = e.value.replace(/^ +/, '');
        e.value = e.value.replace(/ +$/, '');
    });

    let okay = true;

    /**
     * Mark an element as a bad response
     * @param e {HTMLElement} to mark as bad
     * @param reason {string} reason for marking as bad
     */
    const markBad = function(e, reason = "Invalid response") {
        e.classList.add('bad');
        e.addEventListener('focus', (e)=>e.target.classList.remove('bad'));
        e.title = reason;
    };

    // Clean existing failures
    form.querySelectorAll('.bad').forEach(e => e.classList.remove('bad'));

    form.querySelectorAll('.mandatory input, .mandatory textarea, .mandatory select')
        .forEach(e => {
            if(!e.value && !allowEmpty && !e.classList.contains('optional')) {
                okay = false;
                markBad(e, "This field is required.");
            }
        });

    // Mark OSFuser obsolete if OSF is complete
    let elm = document.querySelector('#osfUser').closest('.row');
    if(elm) {
        if(document.querySelector('#osf').value != "") {
            elm.classList.add('obsolete');
            elm.title = "This field is unavailable when a custom OSF repository has been supplied."
        } else {
            elm.classList.remove('obsolete');
            elm.title = "";
        }
    }

    // Warn if they have 'reproducibilitea' in the name field
    elm = form.querySelector('#name');
    if(/ReproducibiliTea/i.test(elm.value)) {
        markBad(elm, "Please do not include 'ReproducibiliTea' in your JC name!")
    }

    // Server-side check matching
    elm = form.querySelector('#name');
    if(!/^\s*[a-z0-9\- ]+\s*$/i.test(elm.value) && !(!elm.value && allowEmpty)) {
        okay = false;
        markBad(elm, "Field contains invalid characters.");
    }

    elm = form.querySelector('#osfUser');
    if(elm) {
        if(!/^\s*(?:https?:\/\/osf.io\/)?([0-9a-z]+)\/?\s*$/i.test(elm.value) &&
            elm.value &&
            !elm.classList.contains('obsolete')) {
            okay = false;
            markBad(elm, "Field contains invalid characters.");
        }
    }

    elm = form.querySelector('#zoteroUser');
    if(elm && !/^\s*[0-9]+\s*$/i.test(elm.value) && !(!elm.value)) {
        okay = false;
        markBad(elm, "Field contains invalid characters.");
    }

    elm = form.querySelector('#email');
    if(!/\S+@\S+/i.test(elm.value) && !(!elm.value && allowEmpty)) {
        okay = false;
        markBad(elm, "Field does not appear to be a well-formed email address.");
    }

    // additional emails
    form.querySelectorAll('.emails input.optional').forEach(e => {
        if(!/\S+@\S+/i.test(e.value) && e.value) {
            okay = false;
            markBad(e, "Field does not appear to be a well-formed email address.");
        }
    });

    elm = form.querySelector('#geolocation');
    let d = elm.value.split(',');
    d = d.map(a => parseFloat(a));
    if(!d || d.length !== 2 || !d.reduce((p, c) => p && isFinite(c))) {
        okay = false;
        markBad(elm, "Please click the marker icon to locate your journal club on the map.");
    }

    // Check JC Name isn't already in use
    if(!window.jcEditToken) {
        const name = document.getElementById("name");

        document.getElementById("existing-jc-names").content.querySelectorAll("div").forEach(
            d => {
                if(d.innerText === name.value) {
                    okay = false;
                    name.classList.add('bad');
                    name.addEventListener('focus', (e)=>e.target.classList.remove('bad'));
                    name.title = "The name cannot match an existing journal club's name.";
                }
            }
        );
    }

    return okay;
}

/**
 * Check and submit form, then fill in the response from the server
 * @param e {Event} button click event
 * @return {boolean}
 */
async function submitForm(e) {
    // no submit action
    e.preventDefault();

    const form = document.querySelector('#newJC');

    // Create the JC id from the name
    document.querySelector('#jcid').value = document.querySelector('#name').value.replace(/\s/g, '-').toLowerCase();

    // Check form
    if(!checkForm(form))
        return false;

    const formData = {};

    document.querySelectorAll('form input, form textarea, form select').forEach(e => formData[e.name] = e.value);

    // Show pending status
    form.style.maxHeight = getComputedStyle(form).height;
    setTimeout(() => form.classList.add('cloak'), 0);

    const elm = document.createElement('div');
    elm.id = 'response';
    elm.innerHTML = '<div class="icon"><i class="fas fa-mug-hot fa-spin"></i></div>';

    document.querySelector('main .wrapper').appendChild(elm);

    // Send off to netlify functions handler and fill in response
    try {
        const response = await fetch('/.netlify/functions/new-jc', {
            method: 'POST',
            body: JSON.stringify(formData)
        });

        const result = await response.text();

        elm.innerHTML = "";

        const h = document.createElement('h1');
        h.classList.add('api-report');
        h.innerHTML = "Submission result:";
        elm.appendChild(h);

        const report = document.createElement('div');
        report.classList.add('detail');
        report.innerHTML = result;

        elm.appendChild(report);

    } catch (error) {
        console.log(error);
    }
}