(() => {
  const marquee = document.querySelector('.r-photo-marquee');
  const track = marquee?.querySelector('.r-photo-marquee-track');
  const firstGroup = marquee?.querySelector('.r-photo-marquee-group');
  if (!marquee || !track || !firstGroup) return;

  let pausedUntil = 0;
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let lastTime = performance.now();
  const speed = 16; // px/sec - slow automatic flow

  const groupWidth = () => {
    const gap = parseFloat(getComputedStyle(track).gap || '0');
    return firstGroup.getBoundingClientRect().width + gap;
  };

  const normalize = () => {
    const width = groupWidth();
    if (!width) return;
    if (marquee.scrollLeft >= width) marquee.scrollLeft -= width;
    if (marquee.scrollLeft < 0) marquee.scrollLeft += width;
  };

  const pauseAuto = (ms = 1400) => {
    pausedUntil = performance.now() + ms;
  };

  marquee.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      pauseAuto(1800);
      return;
    }
    dragging = true;
    startX = e.clientX;
    startScroll = marquee.scrollLeft;
    marquee.classList.add('is-dragging');
    marquee.setPointerCapture?.(e.pointerId);
    pauseAuto(2500);
  });

  marquee.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerType === 'touch') return;
    const dx = e.clientX - startX;
    marquee.scrollLeft = startScroll - dx;
    normalize();
    e.preventDefault();
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    marquee.classList.remove('is-dragging');
    try { marquee.releasePointerCapture?.(e.pointerId); } catch {}
    pauseAuto(1500);
  };

  marquee.addEventListener('pointerup', endDrag);
  marquee.addEventListener('pointercancel', endDrag);
  marquee.addEventListener('pointerleave', (e) => {
    if (dragging && e.pointerType !== 'touch') endDrag(e);
  });

  marquee.addEventListener('touchstart', () => pauseAuto(2200), {passive:true});
  marquee.addEventListener('touchend', () => pauseAuto(1300), {passive:true});
  marquee.addEventListener('wheel', () => pauseAuto(1600), {passive:true});
  marquee.addEventListener('scroll', normalize, {passive:true});

  const tick = (now) => {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!dragging && now > pausedUntil && !document.hidden) {
      marquee.scrollLeft += speed * dt;
      normalize();
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
})();