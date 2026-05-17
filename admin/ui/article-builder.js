// admin/ui/article-builder.js
// AI Full Article Builder — 4-phase modal UI
// Depends on: SB global (supabase-client.js), window._insertBlocks (app.js)
// CDN deps: pdfjs-dist (pdf.js), mammoth.js — loaded via index.html

(function() {
'use strict';

// ── Helpers ──

function escText(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  });
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    });
  }
  return e;
}

async function getAuthToken() {
  // SB.client is the raw Supabase client exposed by supabase-client.js (line 109)
  if (window.SB && window.SB.client) {
    const { data } = await window.SB.client.auth.getSession();
    return data?.session?.access_token || null;
  }
  return null;
}

async function apiFetch(endpoint, body) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated — please log in again');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ── File Parsing ──

async function parsePDF(file) {
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
  const arrayBuf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n\n');
}

async function parseDOCX(file) {
  if (!window.mammoth) throw new Error('Mammoth.js not loaded');
  const arrayBuf = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuf });
  return result.value;
}

async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return parsePDF(file);
  if (name.endsWith('.docx')) return parseDOCX(file);
  return file.text();
}

// ── State ──

let builderState = null;

function resetState() {
  builderState = {
    phase: 1,
    sources: [],
    lang: 'de',
    tone: 'investigative',
    facts: [],
    plan: [],
    warnings: [],
    generated: [],
    modal: null,
  };
}

// ── Modal Shell ──

function openModal() {
  closeModal();
  const backdrop = el('div', { className: 'ab-backdrop' });
  const modal = el('div', { className: 'ab-modal' });

  const header = el('div', { className: 'ab-header' }, [
    el('h2', { className: 'ab-title', textContent: '⚡ Full Article Builder' }),
    el('div', { className: 'ab-phases' }),
    el('button', { className: 'ab-close', textContent: '✕', onClick: closeModal }),
  ]);

  const body = el('div', { className: 'ab-body' });
  const footer = el('div', { className: 'ab-footer' });

  modal.append(header, body, footer);
  backdrop.appendChild(modal);
  document.getElementById('modal-root').appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  builderState.modal = { backdrop, modal, header, body, footer };
  updatePhaseIndicator();
  return { body, footer };
}

function closeModal() {
  const existing = document.querySelector('.ab-backdrop');
  if (existing) existing.remove();
  builderState = null;
}

function updatePhaseIndicator() {
  if (!builderState?.modal) return;
  const container = builderState.modal.header.querySelector('.ab-phases');
  container.innerHTML = '';
  const phases = ['Ingest', 'Plan', 'Generate', 'Review'];
  phases.forEach((name, i) => {
    const num = i + 1;
    const dot = el('div', {
      className: `ab-phase-dot ${num === builderState.phase ? 'active' : ''} ${num < builderState.phase ? 'done' : ''}`,
      textContent: num < builderState.phase ? '✓' : String(num),
    });
    const label = el('span', { className: 'ab-phase-label', textContent: name });
    const step = el('div', { className: 'ab-phase-step' }, [dot, label]);
    container.appendChild(step);
    if (i < phases.length - 1) container.appendChild(el('div', { className: 'ab-phase-line' }));
  });
}

// ── Phase 1: Ingest ──

function renderPhase1() {
  const { body, footer } = openModal();

  const tabs = el('div', { className: 'ab-tabs' });
  const tabData = [
    { id: 'paste', label: '📝 Paste Text' },
    { id: 'upload', label: '📎 Upload Files' },
    { id: 'url', label: '🔗 Add URL' },
  ];
  let activeTab = 'paste';
  const tabContent = el('div', { className: 'ab-tab-content' });

  function renderTab(tabId) {
    activeTab = tabId;
    tabs.querySelectorAll('.ab-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    tabContent.innerHTML = '';

    if (tabId === 'paste') {
      const textarea = el('textarea', { className: 'ab-paste-area', placeholder: 'Paste article drafts, research notes, interview transcripts…', rows: '12' });
      const addBtn = el('button', { className: 'ab-add-source', textContent: '+ Add as source', onClick: () => {
        const text = textarea.value.trim();
        if (!text) return;
        builderState.sources.push({ type: 'text', content: text, label: 'Pasted text' });
        textarea.value = '';
        renderSourceList();
      }});
      tabContent.append(textarea, addBtn);

    } else if (tabId === 'upload') {
      const dropZone = el('div', { className: 'ab-drop-zone', innerHTML: '<div class="ab-drop-icon">📄</div><div>Drop PDF, DOCX, or text files here</div><div class="ab-drop-hint">or click to browse</div>' });
      const fileInput = el('input', { type: 'file', accept: '.pdf,.docx,.doc,.txt,.md', multiple: 'true', style: 'display:none' });
      dropZone.addEventListener('click', () => fileInput.click());
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
      fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFiles(fileInput.files); });
      tabContent.append(dropZone, fileInput);

    } else if (tabId === 'url') {
      const urlInput = el('input', { type: 'url', className: 'ab-url-input', placeholder: 'https://example.com/article' });
      const fetchBtn = el('button', { className: 'ab-add-source', textContent: '+ Fetch & Add', onClick: async () => {
        const url = urlInput.value.trim();
        if (!url) return;
        fetchBtn.disabled = true;
        fetchBtn.textContent = 'Fetching…';
        try {
          const result = await apiFetch('/api/scrape', { url });
          builderState.sources.push({ type: 'text', content: result.text, label: url });
          urlInput.value = '';
          renderSourceList();
        } catch (err) {
          alert('Failed to fetch URL: ' + err.message);
        } finally {
          fetchBtn.disabled = false;
          fetchBtn.textContent = '+ Fetch & Add';
        }
      }});
      tabContent.append(urlInput, fetchBtn);
    }
  }

  tabData.forEach(td => {
    const tab = el('button', { className: 'ab-tab' + (td.id === activeTab ? ' active' : ''), textContent: td.label, 'data-tab': td.id, onClick: () => renderTab(td.id) });
    tabs.appendChild(tab);
  });

  const settings = el('div', { className: 'ab-settings' });

  const langSelect = el('select', { className: 'ab-select', onChange: (e) => { builderState.lang = e.target.value; } });
  [{ v: 'de', l: 'Deutsch' }, { v: 'en', l: 'English' }, { v: 'tr', l: 'Türkçe' }, { v: 'fr', l: 'Français' }, { v: 'es', l: 'Español' }].forEach(opt => {
    const o = el('option', { value: opt.v, textContent: opt.l });
    if (opt.v === builderState.lang) o.selected = true;
    langSelect.appendChild(o);
  });

  const toneGroup = el('div', { className: 'ab-tone-group' });
  ['investigative', 'explainer', 'feature', 'opinion'].forEach(tone => {
    const btn = el('button', {
      className: 'ab-tone-btn' + (tone === builderState.tone ? ' active' : ''),
      textContent: tone.charAt(0).toUpperCase() + tone.slice(1),
      onClick: (e) => {
        builderState.tone = tone;
        toneGroup.querySelectorAll('.ab-tone-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      }
    });
    toneGroup.appendChild(btn);
  });

  settings.append(
    el('div', { className: 'ab-setting' }, [el('label', { textContent: 'Language' }), langSelect]),
    el('div', { className: 'ab-setting' }, [el('label', { textContent: 'Tone' }), toneGroup])
  );

  const sourceList = el('div', { className: 'ab-source-list', id: 'ab-source-list' });

  function renderSourceList() {
    sourceList.innerHTML = '';
    if (builderState.sources.length === 0) {
      sourceList.innerHTML = '<div class="ab-empty">No sources added yet</div>';
      return;
    }
    builderState.sources.forEach((src, i) => {
      const words = src.content.split(/\s+/).length;
      const row = el('div', { className: 'ab-source-row' }, [
        el('span', { className: 'ab-source-icon', textContent: '📄' }),
        el('span', { className: 'ab-source-label', textContent: src.label }),
        el('span', { className: 'ab-source-words', textContent: `${words.toLocaleString()} words` }),
        el('button', { className: 'ab-source-remove', textContent: '✕', onClick: () => {
          builderState.sources.splice(i, 1);
          renderSourceList();
        }}),
      ]);
      sourceList.appendChild(row);
    });
  }

  body.append(tabs, tabContent, settings, el('h3', { className: 'ab-section-head', textContent: 'Sources' }), sourceList);
  renderTab('paste');
  renderSourceList();

  footer.innerHTML = '';
  const analyzeBtn = el('button', { className: 'ab-primary-btn', textContent: 'Analyze Sources →', onClick: async () => {
    if (builderState.sources.length === 0) { alert('Add at least one source first.'); return; }
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing…';
    try {
      const result = await apiFetch('/api/article-builder', {
        action: 'analyze',
        sources: builderState.sources,
        lang: builderState.lang,
        tone: builderState.tone,
      });
      builderState.facts = result.facts || [];
      builderState.plan = result.plan || [];
      builderState.warnings = result.warnings || [];
      builderState.phase = 2;
      renderPhase2();
    } catch (err) {
      alert('Analysis failed: ' + err.message);
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'Analyze Sources →';
    }
  }});
  footer.appendChild(analyzeBtn);

  async function handleFiles(fileList) {
    for (const file of fileList) {
      try {
        const text = await parseFile(file);
        builderState.sources.push({ type: 'text', content: text, label: file.name });
      } catch (err) {
        alert(`Failed to parse ${file.name}: ${err.message}`);
      }
    }
    renderSourceList();
  }
}

// ── Phase 2: Analyze & Plan ──

function renderPhase2() {
  const { body, footer } = builderState.modal;
  body.innerHTML = '';
  footer.innerHTML = '';
  updatePhaseIndicator();

  if (builderState.warnings.length > 0) {
    const warns = el('div', { className: 'ab-warnings' });
    builderState.warnings.forEach(w => {
      warns.appendChild(el('div', { className: 'ab-warning', innerHTML: `⚠️ ${escText(w)}` }));
    });
    body.appendChild(warns);
  }

  const factsSection = el('div', { className: 'ab-facts-section' });
  const factsHead = el('div', { className: 'ab-facts-head', innerHTML: `<span>📋 Extracted Facts (${builderState.facts.length})</span><button class="ab-toggle">Show</button>` });
  const factsList = el('div', { className: 'ab-facts-list collapsed' });

  factsHead.querySelector('.ab-toggle').addEventListener('click', (e) => {
    const collapsed = factsList.classList.toggle('collapsed');
    e.target.textContent = collapsed ? 'Show' : 'Hide';
  });

  builderState.facts.forEach(fact => {
    const row = el('div', { className: 'ab-fact-row' + (fact.flag ? ' flagged' : '') }, [
      fact.flag ? el('span', { className: 'ab-fact-flag', textContent: '⚠️', title: fact.flag.replace(/_/g, ' ') }) : null,
      el('span', { className: 'ab-fact-claim', textContent: fact.claim }),
      fact.section ? el('span', { className: 'ab-fact-source', textContent: fact.section }) : null,
    ]);
    factsList.appendChild(row);
  });
  factsSection.append(factsHead, factsList);
  body.appendChild(factsSection);

  body.appendChild(el('h3', { className: 'ab-section-head', textContent: 'Article Structure' }));
  const planList = el('div', { className: 'ab-plan-list', id: 'ab-plan-list' });

  function renderPlan() {
    planList.innerHTML = '';
    builderState.plan.forEach((item, i) => {
      const row = el('div', { className: 'ab-plan-row', draggable: 'true', 'data-idx': String(i) });
      row.innerHTML = `
        <span class="ab-plan-handle">⠿</span>
        <span class="ab-plan-badge">${escText(item.type)}</span>
        <span class="ab-plan-headline">${escText(item.headline || '')}</span>
        <span class="ab-plan-rationale">${escText(item.rationale || '')}</span>
        <button class="ab-plan-remove" title="Remove">✕</button>
      `;
      row.querySelector('.ab-plan-remove').addEventListener('click', () => {
        builderState.plan.splice(i, 1);
        renderPlan();
      });

      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        if (fromIdx === i || isNaN(fromIdx)) return;
        const [moved] = builderState.plan.splice(fromIdx, 1);
        builderState.plan.splice(i, 0, moved);
        renderPlan();
      });

      planList.appendChild(row);
    });
  }

  body.appendChild(planList);
  renderPlan();

  const backBtn = el('button', { className: 'ab-secondary-btn', textContent: '← Back', onClick: () => {
    builderState.phase = 1;
    renderPhase1();
  }});
  const generateBtn = el('button', { className: 'ab-primary-btn', textContent: `Generate ${builderState.plan.length} Blocks →`, onClick: () => {
    if (builderState.plan.length === 0) { alert('Plan is empty.'); return; }
    builderState.phase = 3;
    renderPhase3();
  }});
  footer.append(backBtn, generateBtn);
}

// ── Phase 3: Generate ──

function renderPhase3() {
  const { body, footer } = builderState.modal;
  body.innerHTML = '';
  footer.innerHTML = '';
  updatePhaseIndicator();

  const total = builderState.plan.length;
  let current = 0;
  let failed = 0;

  const progress = el('div', { className: 'ab-progress' });
  const progressBar = el('div', { className: 'ab-progress-bar' });
  const progressText = el('div', { className: 'ab-progress-text', textContent: `Generating block 1 of ${total}…` });
  progress.appendChild(progressBar);
  body.append(progress, progressText);

  const statusList = el('div', { className: 'ab-gen-list' });
  builderState.plan.forEach((item, i) => {
    const row = el('div', { className: 'ab-gen-row queued', 'data-idx': String(i) }, [
      el('span', { className: 'ab-gen-status', textContent: '⏳' }),
      el('span', { className: 'ab-gen-badge', textContent: item.type }),
      el('span', { className: 'ab-gen-headline', textContent: item.headline || '' }),
    ]);
    statusList.appendChild(row);
  });
  body.appendChild(statusList);

  footer.innerHTML = '<div class="ab-gen-note">Please wait while blocks are generated one at a time…</div>';

  async function generateAll() {
    const previousSummaries = [];

    for (let i = 0; i < total; i++) {
      current = i;
      progressText.textContent = `Generating block ${i + 1} of ${total}…`;
      progressBar.style.width = `${((i) / total) * 100}%`;

      const row = statusList.querySelector(`[data-idx="${i}"]`);
      row.className = 'ab-gen-row generating';
      row.querySelector('.ab-gen-status').textContent = '🔄';

      try {
        const planItem = builderState.plan[i];
        const result = await apiFetch('/api/article-builder', {
          action: 'generate-block',
          type: planItem.type,
          planItem,
          sourceChunks: builderState.sources.map(s => s.content),
          facts: builderState.facts,
          articleContext: {
            title: builderState.plan[0]?.headline || 'Article',
            tone: builderState.tone,
            lang: builderState.lang,
            blockIndex: i,
            totalBlocks: total,
            previousSummaries: previousSummaries.join('; '),
          },
          lang: builderState.lang,
        });

        builderState.generated.push({
          type: planItem.type,
          data: result.data,
          confidence: result.confidence || 'medium',
          sourceRefs: result.sourceRefs || [],
          status: 'done',
        });

        previousSummaries.push(`Block ${i + 1} (${planItem.type}): ${planItem.headline || 'content'}`);

        row.className = `ab-gen-row done conf-${result.confidence || 'medium'}`;
        row.querySelector('.ab-gen-status').textContent = result.confidence === 'high' ? '✅' : result.confidence === 'low' ? '🔴' : '🟡';
      } catch (err) {
        failed++;
        builderState.generated.push({
          type: builderState.plan[i].type,
          data: null,
          confidence: null,
          status: 'failed',
          error: err.message,
        });
        row.className = 'ab-gen-row failed';
        row.querySelector('.ab-gen-status').textContent = '❌';
      }
    }

    progressBar.style.width = '100%';
    progressText.textContent = failed > 0
      ? `Done — ${total - failed} blocks generated, ${failed} failed`
      : `All ${total} blocks generated successfully!`;

    builderState.phase = 4;
    footer.innerHTML = '';
    footer.appendChild(el('button', { className: 'ab-primary-btn', textContent: 'Review Results →', onClick: renderPhase4 }));
  }

  generateAll();
}

// ── Phase 4: Review ──

function renderPhase4() {
  const { body, footer } = builderState.modal;
  body.innerHTML = '';
  footer.innerHTML = '';
  updatePhaseIndicator();

  const generated = builderState.generated.filter(g => g.status === 'done');
  const failedCount = builderState.generated.filter(g => g.status === 'failed').length;
  const highCount = generated.filter(g => g.confidence === 'high').length;
  const mediumCount = generated.filter(g => g.confidence === 'medium').length;
  const lowCount = generated.filter(g => g.confidence === 'low').length;

  const summary = el('div', { className: 'ab-review-summary' });
  summary.innerHTML = `
    <div class="ab-review-stat"><span class="ab-review-num">${generated.length}</span><span class="ab-review-label">Blocks generated</span></div>
    <div class="ab-review-stat high"><span class="ab-review-num">${highCount}</span><span class="ab-review-label">High confidence</span></div>
    <div class="ab-review-stat medium"><span class="ab-review-num">${mediumCount}</span><span class="ab-review-label">Medium confidence</span></div>
    ${lowCount > 0 ? `<div class="ab-review-stat low"><span class="ab-review-num">${lowCount}</span><span class="ab-review-label">Low confidence</span></div>` : ''}
    ${failedCount > 0 ? `<div class="ab-review-stat failed"><span class="ab-review-num">${failedCount}</span><span class="ab-review-label">Failed</span></div>` : ''}
  `;
  body.appendChild(summary);

  const blockList = el('div', { className: 'ab-review-blocks' });
  builderState.generated.forEach((g, i) => {
    if (g.status !== 'done') return;
    const confClass = g.confidence || 'medium';
    const row = el('div', { className: `ab-review-row conf-${confClass}` });
    row.innerHTML = `
      <span class="ab-review-conf-dot"></span>
      <span class="ab-review-type">${escText(g.type)}</span>
      <span class="ab-review-preview">${escText(getBlockPreview(g))}</span>
    `;
    blockList.appendChild(row);
  });
  body.appendChild(blockList);

  if (lowCount > 0 || failedCount > 0) {
    body.appendChild(el('div', { className: 'ab-review-note', textContent: 'Blocks with medium/low confidence will show badges in the sidebar. Use the Enhance button to refine them.' }));
  }

  const backBtn = el('button', { className: 'ab-secondary-btn', textContent: '← Back to Plan', onClick: () => {
    builderState.generated = [];
    builderState.phase = 2;
    renderPhase2();
  }});
  const insertBtn = el('button', { className: 'ab-primary-btn', textContent: `Insert ${generated.length} Blocks into Page`, onClick: () => {
    const blocks = generated.map(g => ({
      id: 'b_' + Math.random().toString(36).slice(2, 10),
      type: g.type,
      data: g.data,
    }));
    if (window._insertBlocks) {
      window._insertBlocks(blocks);
    } else {
      alert('Cannot insert blocks — page editor not ready. Please try refreshing.');
      return;
    }
    closeModal();
  }});
  footer.append(backBtn, insertBtn);
}

function getBlockPreview(g) {
  if (!g.data) return '(empty)';
  if (g.data.titleHtml) return g.data.titleHtml.replace(/<[^>]+>/g, '').slice(0, 60);
  if (g.data.h2) return g.data.h2.slice(0, 60);
  if (g.data.title) return g.data.title.slice(0, 60);
  if (g.data.text) return g.data.text.slice(0, 60);
  if (g.data.headline) return g.data.headline.slice(0, 60);
  if (g.data.content && g.data.content[0]) {
    const first = g.data.content[0];
    return (first.text || first.html || '').replace(/<[^>]+>/g, '').slice(0, 60);
  }
  return g.type;
}

// ── Entry Point ──

window.openArticleBuilder = function() {
  resetState();
  renderPhase1();
};

})();
