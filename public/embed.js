/**
 * Luau Playground embed helper.
 *
 * An iframe cannot resize itself, so embedded playgrounds ask the host page for
 * the height they need when the reader hits "Expand". Include this script once
 * per page and it handles every playground embed on it:
 *
 *   <iframe src="https://play.luau.org/?embed=true#..."></iframe>
 *   <script src="https://play.luau.org/embed.js" async></script>
 *
 * Embeds are matched by origin, or by a `data-luau-playground` attribute for
 * hosts that proxy the playground from somewhere else.
 */
(function () {
  'use strict';

  var SOURCE = 'luau-playground';
  var origin = document.currentScript
    ? new URL(document.currentScript.src, location.href).origin
    : null;

  function embeds() {
    var frames = document.querySelectorAll('iframe');
    var matched = [];
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      var sameOrigin = origin && frame.src.indexOf(origin) === 0;
      if (sameOrigin || frame.hasAttribute('data-luau-playground')) matched.push(frame);
    }
    return matched;
  }

  function frameFor(win) {
    var found = null;
    embeds().forEach(function (frame) {
      if (frame.contentWindow === win) found = frame;
    });
    return found;
  }

  function announce(frame) {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({ source: SOURCE, type: 'host-ready' }, '*');
  }

  function resize(frame, height) {
    if (!('luauBaseHeight' in frame.dataset)) {
      // May be empty, in which case collapsing falls back to the page's own CSS
      frame.dataset.luauBaseHeight = frame.style.height;
    }

    if (!height) {
      frame.style.height = frame.dataset.luauBaseHeight;
      return;
    }

    frame.style.height = height + 'px';
    // The embed asked for a viewport height; add back whatever the host's
    // borders or box-sizing just ate
    var shortfall = height - frame.clientHeight;
    if (shortfall > 0) frame.style.height = height + shortfall + 'px';
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.source !== SOURCE) return;

    var frame = frameFor(event.source);
    if (!frame) return;

    if (data.type === 'ready') {
      announce(frame);
    } else if (data.type === 'resize') {
      resize(frame, data.height);
    }
  });

  // Embeds that finished loading before this script ran are still waiting
  embeds().forEach(announce);
  window.addEventListener('load', function () {
    embeds().forEach(announce);
  });
})();
