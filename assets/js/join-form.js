/**
 Functions for operating the join form page
 */

/**
 * Add a new organiser field below the current latest one
 * @param e {Event} button click event
 * @return {boolean}
 */
function addNewOrganiser(e) {
    const lastOrganiser = document.querySelector('#newJC .JC-organisers .organisers input:last-of-type');

    let id = -1;

    if(lastOrganiser.name !== 'lead') {
        // Find the ID of the latest organiser
        const regex = /helper([0-9]+)/.exec(lastOrganiser.id);
        if(regex[1])
            id = parseInt(regex[1]);
    }

    let newOrganiser = document.createElement('input');
    newOrganiser.type = 'text';
    newOrganiser.classList.add('optional');
    newOrganiser.id = 'helper' + (id + 1);
    newOrganiser.name = newOrganiser.id;
    newOrganiser.placeholder = 'Helper #' + (id + 2);

    lastOrganiser.parentElement.insertBefore(newOrganiser, lastOrganiser.nextSibling);

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
    let elm = document.querySelector('#osfUser');
    if(document.querySelector('#osf').value != "") {
        elm.classList.add('obsolete');
    } else {
        elm.classList.remove('obsolete');
    }

    // Warn if they have 'reproducibilitea' in the name field
    elm = form.querySelector('#name');
    if(/ReproducibiliTea/i.test(elm.value)) {
        markBad(elm, "Please do not include 'ReproducibiliTea' in your JC name!")
    }

    // Server-side check matching
    elm = form.querySelector('#name');
    if(!/^[a-z0-9\- ]+$/i.test(elm.value) && !(!elm.value && allowEmpty)) {
        okay = false;
        markBad(elm, "Field contains invalid characters.");
    }

    elm = form.querySelector('#osfUser');
    if(!/^[a-z0-9]+$/i.test(elm.value) &&
        elm.value &&
        !elm.classList.contains('obsolete')) {
        okay = false;
        markBad(elm, "Field contains invalid characters.");
    }

    elm = form.querySelector('#zoteroUser');
    if(!/^[0-9]+$/i.test(elm.value) && !(!elm.value)) {
        okay = false;
        markBad(elm, "Field contains invalid characters.");
    }

    elm = form.querySelector('#email');
    if(!/\S+@\S+/i.test(elm.value) && !(!elm.value && allowEmpty)) {
        okay = false;
        markBad(elm, "Field does not appear to be a well-formed email address.");
    }

    // Check JC Name isn't already in use
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