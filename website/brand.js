(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.site-header .brand').forEach(brand => {
    const logo = brand.querySelector('img');
    let spin = null;
    brand.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch' || reducedMotion.matches || spin) return;
      const animation = logo.animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: 750, easing: 'cubic-bezier(.22,.61,.36,1)', iterations: 1 }
      );
      spin = animation;
      // Leaving or re-entering the logo does not interrupt an active turn.
      animation.finished.then(() => {
        if (spin === animation) spin = null;
      }).catch(() => {
        if (spin === animation) spin = null;
      });
    });
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) { spin?.cancel(); spin = null; }
    });
  });
})();
