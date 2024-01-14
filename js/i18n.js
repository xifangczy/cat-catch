document.querySelectorAll('[data-i18n], [data-i18n-outer]').forEach(function (element) {
    if (element.dataset.i18n) {
        element.innerHTML = i18n(element.dataset.i18n);
        return;
    }
    element.outerHTML = i18n(element.dataset.i18nOuter);
});