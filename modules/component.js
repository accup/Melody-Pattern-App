/**
 * 
 * @param {HTMLElement} element
 * @param {(value: string) => void} listener
 */
export function initButtonGroup(element, listener) {
    function onChange() {
        for (const button of element.children) {
            button.classList.toggle(
                'selected',
                button.dataset.value === element.dataset.value,
            );
        }
    }

    for (const button of element.children) {
        button.addEventListener('click', e => {
            e.preventDefault();

            const value = e.target.dataset.value
            element.dataset.value = value;
            onChange();

            listener(value);
        });
    }
    if (!('value' in element.dataset) && element.firstElementChild != null) {
        element.dataset.value = element.firstElementChild.dataset.value;
    }
    onChange();
    listener(element.dataset.value);
}
