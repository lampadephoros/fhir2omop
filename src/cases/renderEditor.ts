// Structured editor for a golden case file. The case skeleton is form-driven —
// title, notes, add/remove fixtures, add/remove variants, per-variant desc and
// add/remove FHIR resources. FHIR resource bodies and the expected-OMOP block are
// edited as YAML textareas (those structures are too free-form for fixed fields).
// Save & Run posts to POST /cases/:slug, which writes the file and runs it.
const Y = (o: any) => (Bun as any).YAML.stringify(o, null, 2);

export default async function (ctx: Context, opts: { file?: any; slug?: string; isNew?: boolean; embedded?: boolean }): Promise<string> {
    const isNew = !!opts.isNew;
    const embedded = !!opts.embedded; // rendered inside the detail page's Read/Edit toggle
    const file = opts.file;
    const slug = opts.slug ?? file?.slug ?? "";

    const title = file?.title ?? "";
    const notes = file?.notes ?? "";
    const fixtures: any[] = file?.fixtures ?? [];
    const variants: any[] = isNew
        ? [{ desc: "", fhir: [{ resourceType: "Patient", id: "pt-1" }], omop: {} }]
        : (file?.cases ?? []);

    const fixtureBlock = (yaml: string) => `<div class="fx not-prose mb-2 border border-gray-200 rounded">
  <div class="flex items-center justify-between px-2 py-1 bg-gray-50 border-b border-gray-100"><span class="text-[10px] uppercase tracking-wider text-gray-400">fixture</span><button type="button" onclick="rm(this,'.fx')" class="text-[11px] text-rose-500 hover:underline">remove</button></div>
  <textarea data-fixture spellcheck="false" class="w-full font-mono text-[12px] p-2 outline-none resize-y" rows="${Math.max(3, yaml.split("\n").length)}">${esc(yaml)}</textarea>
</div>`;

    const fhirBlock = (yaml: string) => `<div class="fh not-prose mb-2 border border-sky-200 rounded">
  <div class="flex items-center justify-between px-2 py-1 bg-sky-50 border-b border-sky-100"><span class="text-[10px] uppercase tracking-wider text-sky-700">FHIR resource (YAML)</span><button type="button" onclick="rm(this,'.fh')" class="text-[11px] text-rose-500 hover:underline">remove</button></div>
  <textarea data-fhir spellcheck="false" class="w-full font-mono text-[12px] p-2 outline-none resize-y" rows="${Math.max(4, yaml.split("\n").length)}">${esc(yaml)}</textarea>
</div>`;

    const variantBlock = (v: any, i: number) => {
        const fhirs = (v.fhir ?? []).map((r: any) => fhirBlock(Y(r))).join("");
        const omopYaml = v.omop && Object.keys(v.omop).length ? Y(v.omop) : "";
        return `<div class="variant not-prose mb-4 border border-gray-300 rounded-lg overflow-hidden">
  <div class="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200">
    <span class="text-[11px] font-semibold text-gray-600">Variant</span>
    <button type="button" onclick="rm(this,'.variant')" class="text-[11px] text-rose-600 hover:underline">remove variant</button>
  </div>
  <div class="p-3 space-y-3">
    <label class="block"><span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Description</span>
      <input data-desc value="${esc(v.desc ?? "")}" placeholder="(a) what this variant covers" class="mt-1 w-full text-[13px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-sky-400"></label>
    <div>
      <div class="flex items-center justify-between mb-1"><span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">FHIR input</span><button type="button" onclick="addFhir(this)" class="text-[11px] text-sky-600 hover:underline">+ resource</button></div>
      <div class="fhir-list">${fhirs}</div>
    </div>
    <label class="block"><span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Expected OMOP (YAML)</span>
      <span class="text-[11px] text-gray-400 normal-case"> — <code>{ table: [ { col: value } ] }</code>; leave empty for a negative case (no rows)</span>
      <textarea data-omop spellcheck="false" placeholder="measurement:\n  - person_id: ref:pt-1\n    value_as_number: 5" class="mt-1 w-full font-mono text-[12px] border border-gray-200 rounded p-2 outline-none focus:border-violet-400 resize-y" rows="${Math.max(4, omopYaml.split("\n").length + 1)}">${esc(omopYaml)}</textarea>
    </div>
  </div>
</div>`;
    };

    const slugField = isNew
        ? `<label class="block mb-3"><span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">File name</span>
      <span class="text-[11px] text-gray-400 normal-case"> — <code>&lt;resource&gt;--&lt;table&gt;--&lt;aspect&gt;</code>, lowercase-kebab</span>
      <input data-slug value="${esc(slug)}" placeholder="observation--measurement--value" class="mt-1 w-full font-mono text-[13px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-sky-400"></label>`
        : `<p class="not-prose font-mono text-[11px] text-gray-400 mb-3">cases/${esc(slug)}.json</p>`;

    const header = isNew
        ? `<h1>New test case</h1>`
        : embedded
            ? `<div class="not-prose flex items-center gap-3 mb-3"><span class="text-[15px] font-semibold text-gray-800">Editing</span><button type="button" onclick="casesMode('read')" class="text-[12px] text-gray-500 hover:underline">← back to read</button></div>`
            : `<h1>Edit: ${esc(title || slug)}</h1>`;
    const cancel = embedded
        ? `<button type="button" onclick="casesMode('read')" class="text-[12px] text-gray-500 hover:underline">cancel</button>`
        : `<a href="/cases${isNew ? "" : "/" + enc(slug)}" class="text-[12px] text-gray-500 hover:underline">cancel</a>`;
    return `${header}
<form id="case-editor" class="not-prose" data-slug="${isNew ? "" : esc(slug)}">
  ${slugField}
  <label class="block mb-3"><span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Title</span>
    <input data-f="title" value="${esc(title)}" placeholder="Observation → measurement" class="mt-1 w-full text-[14px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-sky-400"></label>
  <label class="block mb-4"><span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Notes (markdown)</span>
    <textarea data-f="notes" spellcheck="false" class="mt-1 w-full text-[13px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-sky-400 resize-y" rows="3">${esc(notes)}</textarea></label>

  <div class="mb-4">
    <div class="flex items-center justify-between mb-1.5"><span class="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Shared fixtures</span><button type="button" onclick="addFixture()" class="text-[11px] text-emerald-600 hover:underline">+ fixture</button></div>
    <div id="fixtures">${fixtures.map((f) => fixtureBlock(Y(f))).join("")}</div>
  </div>

  <div class="mb-4">
    <div class="flex items-center justify-between mb-1.5"><span class="text-[12px] font-semibold text-gray-700 uppercase tracking-wider">Variants</span><button type="button" onclick="addVariant()" class="text-[11px] text-sky-600 hover:underline">+ variant</button></div>
    <div id="variants">${variants.map(variantBlock).join("")}</div>
  </div>

  <div class="flex items-center gap-3 mt-4 pt-3 border-t border-gray-200">
    <button type="button" onclick="save()" class="px-3 py-1.5 rounded bg-sky-600 text-white text-[13px] font-medium hover:bg-sky-700">Save &amp; Run</button>
    ${cancel}
    <span id="ed-status" class="text-[12px] text-gray-500"></span>
  </div>
  <div id="ed-results" class="mt-3"></div>
</form>

<template id="tpl-fixture">${fixtureBlock("resourceType: Patient\nid: pt-1\ngender: female")}</template>
<template id="tpl-fhir">${fhirBlock("resourceType: Observation\nid: obs-1")}</template>
<template id="tpl-variant">${variantBlock({ desc: "", fhir: [{ resourceType: "Observation", id: "obs-1" }], omop: {} }, 0)}</template>

<script>
(function(){
  const root = document.getElementById('case-editor');
  window.rm = (btn, sel) => btn.closest(sel).remove();
  window.addFixture = () => document.getElementById('fixtures').appendChild(document.getElementById('tpl-fixture').content.cloneNode(true));
  window.addVariant = () => document.getElementById('variants').appendChild(document.getElementById('tpl-variant').content.cloneNode(true));
  window.addFhir = (btn) => btn.closest('.variant').querySelector('.fhir-list').appendChild(document.getElementById('tpl-fhir').content.cloneNode(true));

  function serialize(){
    const slug = (root.dataset.slug || (root.querySelector('[data-slug]')||{}).value || '').trim();
    return {
      slug,
      title: (root.querySelector('[data-f="title"]').value||'').trim(),
      notes: (root.querySelector('[data-f="notes"]').value||'').trim(),
      fixtures: [...document.querySelectorAll('#fixtures [data-fixture]')].map(t=>t.value).filter(s=>s.trim()),
      cases: [...document.querySelectorAll('#variants > .variant')].map(v=>({
        desc: (v.querySelector('[data-desc]').value||'').trim(),
        fhir: [...v.querySelectorAll('[data-fhir]')].map(t=>t.value).filter(s=>s.trim()),
        omop: (v.querySelector('[data-omop]').value||''),
      })),
    };
  }
  const status = (s) => document.getElementById('ed-status').textContent = s;
  window.save = async () => {
    const data = serialize();
    if (!data.slug) { status('⚠ enter a file name'); return; }
    status('saving + running…');
    document.getElementById('ed-results').innerHTML = '';
    try {
      const res = await fetch('/cases/'+encodeURIComponent(data.slug), {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(data)});
      const j = await res.json();
      render(j, data.slug);
    } catch(e){ status('✗ '+e.message); }
  };
  function esc(s){ return String(s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function render(j, slug){
    if (!j.saved || !j.saved.ok){ status(''); document.getElementById('ed-results').innerHTML =
      '<div class="border border-rose-300 bg-rose-50 rounded p-3 text-[13px] text-rose-800">Save failed: '+esc((j.saved&&j.saved.error)||j.error||'unknown')+'</div>'; return; }
    const r = j.run || {};
    let head;
    if (!r.variants) head = '<div class="text-[13px] text-amber-700">Saved, but run produced no results: '+esc(r.error||'')+'</div>';
    else head = '<div class="text-[13px] mb-2">Saved <code>cases/'+esc(slug)+'.json</code> · <strong class="'+(r.fail?'text-rose-700':'text-emerald-700')+'">'+r.pass+'/'+(r.pass+r.fail)+' green</strong> · <a class="text-sky-600 hover:underline" href="/cases/'+encodeURIComponent(slug)+'">open</a></div>';
    const rows = (r.variants||[]).map(v=>'<div class="border-t border-gray-100 py-1.5 text-[12px]"><span class="'+(v.pass?'text-emerald-600':'text-rose-600')+' font-semibold mr-2">'+(v.pass?'✓':'✗')+'</span>'+esc(v.desc)+(v.failures&&v.failures.length?'<ul class="ml-6 mt-1 text-rose-700 font-mono text-[11px]">'+v.failures.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul>':'')+'</div>').join('');
    status('');
    document.getElementById('ed-results').innerHTML = '<div class="border border-gray-200 rounded-lg p-3">'+head+rows+'</div>';
  }
})();
</script>`;
}

function esc(s: string) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function enc(s: string) { return encodeURIComponent(s); }
