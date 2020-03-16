function sortTable(fieldName, ascending = true) {
    document.body.classList.add('sorting');
    setTimeout(_sortTable, 0, fieldName, ascending);
}

// Adapted from https://www.w3schools.com/howto/howto_js_sort_table.asp
function _sortTable(fieldName, ascending = true) {
    let rows, switching, i, x, y, shouldSwitch;

    const table = document.querySelector("table");
    const cellNum = document.querySelector('td[data-field-name="' + fieldName + '"]').cellIndex;

    const f = ascending? (x, y) => x < y : (x, y) => y < x;

    switching = true;
    /* Make a loop that will continue until
    no switching has been done: */
    while (switching) {
        // Start by saying: no switching is done:
        switching = false;
        rows = table.rows;
        /* Loop through all table rows (except the
        first, which contains table headers): */
        for (i = 1; i < (rows.length - 1); i++) {
            // Start by saying there should be no switching:
            shouldSwitch = false;
            /* Get the two elements you want to compare,
            one from current row and one from the next: */
            x = rows[i].getElementsByTagName("TD")[cellNum].innerText.toLowerCase();
            y = rows[i + 1].getElementsByTagName("TD")[cellNum].innerText.toLowerCase();
            // Check if the two rows should switch place:
            if (f(x, y)) {
                // If so, mark as a switch and break the loop:
                shouldSwitch = true;
                break;
            }
        }
        if (shouldSwitch) {
            /* If a switch has been marked, make the switch
            and mark that a switch has been done: */
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
        }
    }
    document.body.classList.remove("sorting");
}