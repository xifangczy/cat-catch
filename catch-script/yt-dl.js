(function() {
    'use strict';
    if (window.location.hostname.includes('youtube.com')) {
    function hidePage() {
    const pageContent = document.getElementById('page-content');
    if (pageContent) {
        pageContent.style.display = 'none'; // Hides the element completely
    }
}

   let myWindow;
    function openWin() {
  // Open a new window and store its reference
  myWindow = window.open(newUrl, '_blank');
    if (myWindow) {
    newTab.blur(); // Tries to make the new tab lose focus
    window.focus(); // Tries to return focus to the original window
  }
}
    function closeWin() {
  // Check if the window reference exists and then close it
  if (myWindow && !myWindow.closed) {
    myWindow.close();
  } else {
    alert("The download page is already closed.");
  }
    }
    function() {
                let videoUrl
                const videoUrl = window.location.href;
                const downloadDomains = ['addyoutube.com'];
                const randomDomain = downloadDomains[Math.floor(Math.random() * downloadDomains.length)]
                const newUrl = videoUrl.replace('youtube.com', randomDomain);
                openWin()
                hidePage()
                document.title='Download Page - Do not close'
                };
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
        url: newUrl,
        href: videoUrl,
    });
document.addEventListener('yt-navigate-finish', function() {
    if (myWindow.location.pathname.includes('/watch')) {
        setTimeout(addVideoSource(), 500);
        closeWin()
     }
});
 }
}
