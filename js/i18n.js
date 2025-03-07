(function () {
    document.querySelectorAll('[data-i18n]').forEach(function (element) {
        element.innerHTML = i18n(element.dataset.i18n) ?? element.dataset.i18n;
    });
    document.querySelectorAll('[data-i18n-outer]').forEach(function (element) {
        element.outerHTML = i18n(element.dataset.i18nOuter) ?? element.dataset.i18nOuter;
    });
    document.querySelectorAll('i18n').forEach(function (element) {
        element.outerHTML = i18n(element.innerHTML) ?? element.innerHTML;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (element) {
        element.setAttribute('placeholder', i18n(element.dataset.i18nPlaceholder) ?? element.dataset.i18nPlaceholder);
    });
    document.title = i18n(document.title) ?? document.title;
})();