(() => {
    const editor = document.getElementById('advertising-your-club');
    const canvas = document.getElementById('meeting-card');
    const logo = document.getElementById('meeting-card-logo');
    const context = canvas.getContext('2d');
    const fields = Object.fromEntries(
        Array.from(editor.querySelectorAll('[data-field]'), field => [field.dataset.field, field])
    );
    const download = editor.querySelector('[data-action="download"]');
    const share = editor.querySelector('[data-action="share"]');
    const feedback = editor.querySelector('[role="status"]');
    const filename = 'reproducibiliTea-card.png';
    let image = null;
    let revision = 0;

    function renderCard() {
        const currentRevision = ++revision;
        const title = fields.title.value.trim() || 'Online Journal Club';
        const club = fields.club.value.trim();
        const handle = fields.handle.value.trim();
        const date = fields.date.value
            ? new Date(fields.date.value + 'T00:00:00').toLocaleDateString('en-GB', { dateStyle: 'long' })
            : '';
        const time = fields.time.value;
        const zone = fields.zone.selectedOptions[0].textContent;
        const schedule = [date, time && time + ' ' + zone].filter(Boolean);

        context.fillStyle = '#e9f5fb';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#0078b6';
        context.fillRect(0, 0, canvas.width, 9);
        if (logo.naturalWidth) {
            context.fillStyle = '#ffffff';
            context.beginPath();
            context.arc(93, 91, 50, 0, Math.PI * 2);
            context.fill();
            context.drawImage(logo, 49, 47, 88, 88);
        }
        context.fillStyle = '#0078b6';
        context.font = 'bold 31px system-ui, sans-serif';
        context.fillText('ReproducibiliTea', 160, 103);

        context.fillStyle = '#404040';
        context.font = 'bold 48px system-ui, sans-serif';
        const titleLines = [''];
        for (const word of title.split(/\s+/)) {
            const index = titleLines.length - 1;
            const line = [titleLines[index], word].filter(Boolean).join(' ');
            if (titleLines[index] && context.measureText(line).width > 710 && index === 0) {
                titleLines.push(word);
            } else {
                titleLines[index] = line;
            }
        }
        titleLines.forEach((line, index) => context.fillText(line, 44, 191 + 54 * index, 712));

        let y = 191 + 54 * (titleLines.length - 1);
        context.font = '32px system-ui, sans-serif';
        if (club) {
            y += 43;
            context.fillText(club, 44, y, 712);
        }
        context.font = 'bold 32px system-ui, sans-serif';
        for (const line of schedule) {
            y += 42;
            context.fillText(line, 44, y, 712);
        }
        if (handle) {
            context.font = '28px system-ui, sans-serif';
            context.fillStyle = '#004d6c';
            context.fillText(handle, 44, y + 38, 712);
        }
        canvas.setAttribute('aria-label', [title, club, ...schedule, handle].filter(Boolean).join(', '));

        image = null;
        share.disabled = true;
        download.disabled = true;
        canvas.toBlob(blob => {
            if (currentRevision !== revision) return;
            if (!blob) {
                feedback.textContent = 'The card image could not be created. Try editing the card and downloading again.';
                return;
            }
            image = new File([blob], filename, { type: 'image/png' });
            download.disabled = false;
            share.hidden = !(typeof navigator.share === 'function' && navigator.canShare?.({ files: [image] }));
            share.disabled = share.hidden;
        }, 'image/png');
    }

    download.addEventListener('click', () => {
        if (!image) return;
        const url = URL.createObjectURL(image);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    share.addEventListener('click', async () => {
        if (!image) return;
        feedback.textContent = '';
        try {
            await navigator.share({ files: [image] });
        } catch (error) {
            if (error.name !== 'AbortError') {
                feedback.textContent = 'Sharing failed. Use Download PNG to save the card and attach it to your post.';
            }
        }
    });

    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    fields.date.value = localDate.toISOString().slice(0, 10);
    const offset = today.toTimeString().match(/GMT[+-]\d{4}/)?.[0];
    if (Array.from(fields.zone.options).some(option => option.value === offset)) {
        fields.zone.value = offset;
    } else {
        fields.zone.value = 'GMT+0000';
    }
    editor.addEventListener('input', () => {
        feedback.textContent = '';
        renderCard();
    });
    if (!logo.complete) logo.addEventListener('load', renderCard, { once: true });
    renderCard();
})();
