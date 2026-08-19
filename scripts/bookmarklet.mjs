// Prints a bookmarklet that loads dist/inspect.js from a URL you host it at.
// Usage: node scripts/bookmarklet.mjs https://your-host.com/inspect.js

const url = process.argv[2] || 'https://cdn.jsdelivr.net/gh/abhineet00/design.inspect@master/dist/inspect.min.js';
const loader = `(function(){if(window.InspectCSS){window.InspectCSS.destroy();return;}var s=document.createElement('script');s.src='${url}?'+Date.now();document.body.appendChild(s);})();`;
console.log('\nBookmarklet (create a bookmark, paste this as the URL):\n');
console.log('javascript:' + encodeURIComponent(loader));
console.log('');
