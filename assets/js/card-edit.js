function updateCard(e) {
    if(e)
        e.preventDefault();
    const card = document.getElementById('card-img');
    const form = document.getElementById('card-form');

    form.querySelectorAll('input, select').forEach(elm => {
        if(!/-in$/i.test(elm.id))
            return;
        const re = elm.id.match(/^(\w+)-in$/i);
        if(!re)
            return;
        const c = card.querySelector(`#${re[1]}`);
        if(!c)
            return;
        c.innerHTML = elm.value;
    });
}

function saveCardPNG() {
    const card = document.getElementById('card-img');
    new Pablo(card).download('png', 'reproducibiliTea-card.png', (r) => console.log(r));
}

function shareCard() {
    const card = document.getElementById('card-img');
    new Pablo(card).toCanvas((canvas) => {
        canvas.toBlob((blob) => {
            const file = new File([blob], 'reproducibiliTea-card.png', { type: 'image/png' });
            navigator.share({ files: [file], title: 'ReproducibiliTea' }).catch(() => {});
        }, 'image/png');
    });
}

function configureShareButton() {
    const btn = document.getElementById('share-btn');
    const label = document.getElementById('save-link');
    const testFile = new File([''], 'card.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [testFile] })) {
        label.textContent = 'Share';
        btn.onclick = shareCard;
    } else {
        label.textContent = 'Download .png';
        btn.onclick = saveCardPNG;
    }
}

document.addEventListener('DOMContentLoaded', configureShareButton);

function setFieldDefaults() {
    const d = new Date();
    const s = d.toString().match(/GMT[+\-][0-9]{4}/);
    if(!s)
        return;
    document.querySelector('#timezone-in option[value="' + s[0] + '"]')
        .selected = "selected";

    const month = d.getMonth() < 10? "0" + d.getMonth().toString() : d.getMonth().toString();
    const day = d.getDate() < 10? "0" + d.getDate().toString() : d.getDate().toString();
    const date = `${d.getFullYear()}-${month}-${day}`;
    document.querySelector('#date-in').value = date;
}

setTimeout(setFieldDefaults, 150);
setTimeout(updateCard, 200);
