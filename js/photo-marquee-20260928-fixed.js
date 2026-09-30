(() => {
  const marquee = document.querySelector('.r-photo-marquee');
  const track = marquee?.querySelector('.r-photo-marquee-track');
  const firstGroup = marquee?.querySelector('.r-photo-marquee-group');
  if (!marquee || !track || !firstGroup) return;

  // トップページは自動収集せず、SERIE Wらしさが伝わる写真だけを固定採用する。
  const SELECTED_PHOTOS = [
    { src: 'https://res.cloudinary.com/kqvfp4bz/image/upload/f_auto,q_auto,c_fill,w_720,h_420/v1790502741/oulfa89ezz5dch9hnoas.jpg', alt: 'SERIE Wのフットサル活動風景' },
    { src: 'https://res.cloudinary.com/kqvfp4bz/image/upload/f_auto,q_auto,c_fill,w_720,h_420/v1789337768/xizf3ixuygeewhkbfzgu.jpg', alt: 'SERIE Wのフットサル活動風景' },
    { src: 'https://res.cloudinary.com/kqvfp4bz/image/upload/f_auto,q_auto,c_fill,w_720,h_420/v1787486908/hfae4bz6fz7rrh2lvj3y.jpg', alt: '屋内で楽しむSERIE Wのフットサル' },
    { src: 'https://res.cloudinary.com/kqvfp4bz/image/upload/f_auto,q_auto,c_fill,w_720,h_420/v1790030148/ca7cea2jd0zphkc5hgby.jpg', alt: 'フットサル交流戦の活動風景' },
    { src: 'https://res.cloudinary.com/kqvfp4bz/image/upload/f_auto,q_auto,c_fill,w_720,h_420/v1787323131/cn95acvuaegmjmywg0fa.jpg', alt: 'SERIE Wのフットサル大会参加風景' },
    { src: 'https://res.cloudinary.com/kqvfp4bz/image/upload/f_auto,q_auto,c_fill,w_720,h_420/v1787431992/ch4ayxgxbwejvxjrejdd.jpg', alt: 'SERIE Wの仲間たち' }
  ];
  let pausedUntil = 0;
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let lastTime = performance.now();
  let autoPosition = marquee.scrollLeft;
  const speed = 16;

  const groupWidth = () => {
    const gap = parseFloat(getComputedStyle(track).gap || '0');
    return firstGroup.getBoundingClientRect().width + gap;
  };

  const makeFigure = ({ src, alt }, eager = false) => {
    const figure = document.createElement('figure');
    figure.style.cssText = 'flex:0 0 auto;width:min(78vw,320px);aspect-ratio:11/5;margin:0;overflow:hidden;border-radius:10px;';
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.loading = eager ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;';
    figure.appendChild(img);
    return figure;
  };

  const rebuildSelectedPhotos = () => {
    firstGroup.replaceChildren(...SELECTED_PHOTOS.map((photo, index) => makeFigure(photo, index < 2)));
    [...track.querySelectorAll(':scope > .r-photo-marquee-group')].slice(1).forEach((group) => group.remove());
    const copy = firstGroup.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('img').forEach((img) => {
      img.alt = '';
      img.loading = 'lazy';
    });
    track.appendChild(copy);
    autoPosition = marquee.scrollLeft;
  };

  const ensureCopies = () => {
    const width = groupWidth();
    if (!width) return;
    while (track.scrollWidth - marquee.clientWidth < width && track.children.length < 8) {
      const copy = firstGroup.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelectorAll('img').forEach((img) => {
        img.alt = '';
        img.loading = 'lazy';
      });
      track.appendChild(copy);
    }
  };

  rebuildSelectedPhotos();
  ensureCopies();
  autoPosition = marquee.scrollLeft;

  const isContentImage = (img) => {
    const src = img.getAttribute('src') || '';
    if (!src) return false;
    return !/favicon|serie-w-crest|\/og\.png(?:$|\?)/i.test(src);
  };

  const loadBlogPhotos = async () => {
    try {
      const indexRes = await fetch('blog/', { cache: 'no-store' });
      if (!indexRes.ok) return;

      const indexHtml = await indexRes.text();
      const indexDoc = new DOMParser().parseFromString(indexHtml, 'text/html');
      const articleLinks = [...indexDoc.querySelectorAll('a.blog-card[href]')]
        .map((a) => {
          try { return new URL(a.getAttribute('href'), indexRes.url).href; }
          catch { return ''; }
        })
        .filter(Boolean);

      const uniqueLinks = [...new Set(articleLinks)];
      const photos = currentPhotos();
      const seen = new Set(photos.map((photo) => photoKey(photo.src)));

      for (let i = 0; i < uniqueLinks.length && photos.length < MAX_PHOTOS; i += ARTICLE_BATCH) {
        const batch = uniqueLinks.slice(i, i + ARTICLE_BATCH);
        const found = await Promise.all(batch.map(async (href) => {
          try {
            const res = await fetch(href, { cache: 'no-store' });
            if (!res.ok) return [];
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const imgs = [...doc.querySelectorAll('.blog-media img, article img')].filter(isContentImage);
            return imgs.slice(0, 3).map((img) => {
              const raw = img.getAttribute('src') || '';
              let src = raw;
              try { src = new URL(raw, res.url).href; } catch {}
              return {
                src,
                alt: img.getAttribute('alt') || 'SERIE Wブログの活動写真',
              };
            });
          } catch {
            return [];
          }
        }));

        for (const articlePhotos of found) {
          for (const photo of articlePhotos) {
            const key = photoKey(photo.src);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            photos.push(photo);
            if (photos.length >= MAX_PHOTOS) break;
          }
          if (photos.length >= MAX_PHOTOS) break;
        }
      }

      if (photos.length > firstGroup.querySelectorAll('img').length) {
        rebuildGroups(photos);
      }
    } catch {
      // 登録済み写真だけで表示を継続する
    }
  };

  ensureCopies();
  window.addEventListener('resize', ensureCopies);

  const normalize = () => {
    const width = groupWidth();
    if (!width) return;
    if (marquee.scrollLeft >= width) marquee.scrollLeft -= width;
    if (marquee.scrollLeft < 0) marquee.scrollLeft += width;
    autoPosition = marquee.scrollLeft;
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

  marquee.addEventListener('touchstart', () => pauseAuto(2200), { passive: true });
  marquee.addEventListener('touchend', () => pauseAuto(1300), { passive: true });
  marquee.addEventListener('wheel', () => pauseAuto(1600), { passive: true });
  marquee.addEventListener('scroll', () => {
    if (dragging || performance.now() < pausedUntil) {
      normalize();
      autoPosition = marquee.scrollLeft;
    }
  }, { passive: true });

  const tick = (now) => {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!dragging && now > pausedUntil && !document.hidden) {
      const width = groupWidth();
      if (width) {
        autoPosition = (autoPosition + speed * dt) % width;
        marquee.scrollLeft = autoPosition;
      }
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
})();
