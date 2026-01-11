(function() {
    'use strict';
    function() {
                const videoUrl = window.location.href;
                const downloadDomains = ['addyoutube.com'];
                const randomDomain = downloadDomains[Math.floor(Math.random() * downloadDomains.length)];
                const newUrl = videoUrl.replace('youtube.com', randomDomain);
                window.open(newUrl, '_blank')};
        function waitForElement(selector, callback, maxTries = 10) 
        let tries = 0;
        
        function check() {
            const element = document.querySelector(selector);
                if (element) {
                callback(element);
                return;
                }
            
                tries++;
                if (tries < maxTries) {
                    setTimeout(check, 1000);
                }
        }
        
        check();
    }
  function addVideoSource() {
        window.postMessage({
        action: "catCatchAddMedia",
        url: downloadDomains,
        href: location.href,
    });
      document.addEventListener('yt-navigate-finish', function() {
        if (window.location.pathname.includes('/watch')) {
            setTimeout(addVideoSource, 1000);
        }
    });

    if (window.location.pathname.includes('/watch')) {
        setTimeout(addVideoSource, 1000);       
  }
