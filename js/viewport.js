export function viewportBounds(viewport, innerHeight) {
  const height = viewport?.height > 0 ? viewport.height : innerHeight;
  return { height, top: Math.max(0, viewport?.offsetTop || 0) };
}

export function trackViewport(win, root) {
  if (!root?.style || !(win.innerHeight > 0)) return;
  const update = () => {
    // Safari changes the visible viewport when browser chrome or the keyboard moves.
    // During pinch zoom, preserve the normal layout instead of resizing controls.
    if (win.visualViewport && win.visualViewport.scale !== 1) return;
    const bounds = viewportBounds(win.visualViewport, win.innerHeight);
    root.style.setProperty('--viewport-height', `${bounds.height}px`);
    root.style.setProperty('--viewport-top', `${bounds.top}px`);
  };
  update();
  win.addEventListener('resize', update);
  win.addEventListener('pageshow', update);
  win.visualViewport?.addEventListener('resize', update);
  win.visualViewport?.addEventListener('scroll', update);
}
