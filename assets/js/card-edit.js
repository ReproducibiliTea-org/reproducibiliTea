function updateCard(e) {
    if(e)
        e.preventDefault();
    const card = document.getElementById('card-img');
    const form = document.getElementById('card-form');

    card.querySelector('#place text').innerHTML =
        form.querySelector('#place').value;
    card.querySelector('#twitter text').innerHTML =
        form.querySelector('#twitter').value;

    const datetime = new Date(form.querySelector('#datetime').value);

    const h = datetime.getHours();
    const m = datetime.getMinutes();
    const time = `${h < 10? 0 : ''}${h}:${m < 10? 0 : ''}${m}`;
    card.querySelector('#time text.scrawl').innerHTML = time;

    card.querySelector('#date text.scrawl').innerHTML = datetime.toDateString();
}

function saveCardPNG() {
    const card = document.getElementById('card-img');
    new Pablo(card).download('png', 'reproducibiliTea-card.png', (r) => console.log(r));
}

setTimeout(updateCard, 200);