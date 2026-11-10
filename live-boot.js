
// ================================================================ GlobalNet LOS — live boot
// Signs the user in with Supabase (two-step verification required), loads the company's data, then starts the LOS screens.
// Loans live in the loans table (core fields) plus loan_ui_state (everything else on the loan screens).
// Company-wide settings, CRM, partners… live in org_app_state. Saves are debounced and conflict-aware (last write wins per loan).
(function () {
  const C = window.GN_CONFIG; const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  const PROG_TO_DB = { conventional: 'conventional', fha: 'fha', va: 'va', usda: 'usda', jumbo: 'jumbo', dscr: 'non_qm_dscr', bank: 'non_qm_bank_statement', pnl: 'non_qm_pnl', asset: 'non_qm_asset_utilization', fn: 'non_qm_foreign_national', itin: 'non_qm_itin' };
  const PROG_FROM_DB = Object.fromEntries(Object.entries(PROG_TO_DB).map(([a, b]) => [b, a]));
  const MS_TO_DB = { Lead: 'lead', 'Pre-qualification': 'lead', 'Pre-approval': 'lead', Application: 'application', Processing: 'processing', Submitted: 'submitted', 'Conditional Approval': 'conditional_approval', Approved: 'conditional_approval', Suspended: 'conditional_approval', 'Clear to Close': 'clear_to_close', 'Docs Out': 'closing', Closed: 'closing', Funded: 'funded', 'Post-Closing': 'post_closing', Withdrawn: 'withdrawn', Cancelled: 'withdrawn', Denied: 'denied' };
  const MS_FROM_DB = { lead: 'Lead', application: 'Application', processing: 'Processing', submitted: 'Submitted', conditional_approval: 'Conditional Approval', clear_to_close: 'Clear to Close', closing: 'Docs Out', funded: 'Funded', post_closing: 'Post-Closing', withdrawn: 'Withdrawn', denied: 'Denied' };
  const PUR_TO_DB = (p) => /cash/i.test(p) ? 'cash_out_refinance' : /refi/i.test(p) ? 'refinance' : /constr/i.test(p) ? 'construction' : /purchase/i.test(p) ? 'purchase' : 'other';
  const PUR_FROM_DB = { purchase: 'Purchase', refinance: 'Refinance', cash_out_refinance: 'Cash-out refinance', construction: 'Construction', other: 'Other' };
  const OCC_TO_DB = (o) => /invest/i.test(o) ? 'investment' : /second/i.test(o) ? 'second_home' : 'primary';
  const OCC_FROM_DB = { primary: 'Primary', second_home: 'Second home', investment: 'Investment' };
  const ROLE_ORDER = [['broker_admin', 'admin'], ['loan_officer', 'lo'], ['processing_manager', 'proc'], ['loan_processor', 'proc'], ['branch_manager', 'lo'], ['loan_assistant', 'lo'], ['compliance_qc', 'admin']];
  const fmtDate = (d) => { if (!d) return '—'; const x = new Date(d + 'T12:00:00'); return x.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }); };
  const toISO = (s) => { if (!s || s === '—') return null; const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10); };
  const num = (v) => v == null || v === '' || isNaN(+v) ? null : +v;
  const loadingEl = () => document.getElementById('gn-live-loading');
  const fail = (msg) => { const el = loadingEl(); if (el) el.innerHTML = `<div class="gnl-card"><b>Could not open the LOS</b><p>${msg}</p><p><a href="login.html">Sign in again</a></p></div>`; };

  function toPreview(row, ui, borrower) {
    const base = ui && ui.data && ui.data.loan ? ui.data.loan : null;
    const city = [row.property_city, row.property_state].filter(Boolean).join(', ') || 'TBD, FL';
    const msDb = row.milestone; const keepMs = base && MS_TO_DB[base.milestone] === msDb;
    const name = borrower ? `${borrower.first_name || ''} ${borrower.last_name || ''}`.trim() : '';
    const l = base ? { ...base } : { borrower: name || 'New borrower', program: 'conventional', purpose: 'Purchase', occ: 'Primary', city, amount: 0, price: null, appraised: null, rate: 6.875, term: 360, taxes: 0, ins: 0, hoa: 0,
      income: 0, debts: 0, assets: 0, closing: 0, prepaids: 0, earnest: 0, milestone: 'Application', close: '—', lo: 'Cristiano O.', docs: {}, events: [{ s: 'Loan created', who: 'GlobalNet LOS', at: fmtDate(row.created_at.slice(0, 10)) }], submissions: [], assignment: null, tasks: [], notes: [] };
    Object.assign(l, { id: row.loan_number, dbId: row.id, program: PROG_FROM_DB[row.program] || l.program || 'conventional', purpose: base && PUR_TO_DB(base.purpose) === row.purpose ? base.purpose : PUR_FROM_DB[row.purpose] || 'Purchase',
      occ: base && OCC_TO_DB(base.occ) === row.occupancy ? base.occ : OCC_FROM_DB[row.occupancy] || 'Primary', milestone: keepMs ? base.milestone : MS_FROM_DB[msDb] || 'Application',
      amount: num(row.loan_amount) ?? l.amount ?? 0, price: num(row.purchase_price) ?? l.price ?? null, appraised: num(row.appraised_value) ?? l.appraised ?? null, rate: num(row.interest_rate) ?? l.rate, term: row.term_months || l.term || 360,
      taxes: num(row.monthly_taxes) ?? l.taxes ?? 0, ins: num(row.monthly_insurance) ?? l.ins ?? 0, hoa: num(row.monthly_hoa) ?? l.hoa ?? 0, city: row.property_city || row.property_state ? city : l.city,
      close: row.estimated_closing_date ? fmtDate(row.estimated_closing_date) : l.close || '—', lenderName: row.lender_name || l.lenderName, businessPurpose: !!row.business_purpose });
    if (!base && name) l.borrower = name;
    return l;
  }
  function coreOf(l) {
    const [cty, st] = String(l.city || '').split(',').map((x) => x.trim()); const x = l.x || {}; const dt = x.dates || {};
    return { program: PROG_TO_DB[l.program] || 'conventional', purpose: PUR_TO_DB(l.purpose || ''), occupancy: OCC_TO_DB(l.occ || ''), milestone: MS_TO_DB[l.milestone] || 'application',
      loan_amount: num(l.amount), purchase_price: num(l.price), appraised_value: num(l.appraised), interest_rate: num(l.rate), term_months: num(l.term) || 360,
      monthly_taxes: num(l.taxes) || 0, monthly_insurance: num(l.ins) || 0, monthly_hoa: num(l.hoa) || 0,
      property_city: cty && cty !== 'TBD' ? cty : null, property_state: st && /^[A-Za-z]{2}$/.test(st) ? st.toUpperCase() : null,
      estimated_closing_date: toISO(dt.closing) || toISO(l.close), application_date: toISO(dt.application), lender_name: l.lenderName || null,
      business_purpose: !!(x.mcr?.businessPurpose ?? l.businessPurpose), funded_date: toISO(dt.funding), action_date: toISO(x.mcr?.actionDate) };
  }
  const G = window.GN_LIVE = { sb, live: true, orgId: null, user: null, roles: [], status: 'loading', lastSaved: null, saving: false };
  let snap = { loans: {}, org: '' }; let timer = null; let inflight = Promise.resolve();

  async function syncNow() {
    if (!G.getS || !G.orgId) return; const S = G.getS(); G.saving = true; liveBadge();
    try {
      // loans: create new ones, push changed core fields and screen data
      for (const l of S.loans) {
        if (!l.dbId) {
          const { data, error } = await sb.rpc('create_loan_with_number', { p_org: G.orgId, p_number: l.id, p_program: PROG_TO_DB[l.program] || 'conventional', p_purpose: PUR_TO_DB(l.purpose || ''), p_occupancy: OCC_TO_DB(l.occ || ''), p_milestone: MS_TO_DB[l.milestone] || 'application' });
          if (error) { console.warn('create loan', l.id, error.message); toast(`Loan ${l.id} was not saved: ${error.message}`); continue; }
          l.dbId = data.id;
        }
        const core = coreOf(l); const ui = JSON.stringify({ loan: l }); const key = l.dbId; const prev = snap.loans[key] || {};
        if (JSON.stringify(core) !== prev.core) { const { error } = await sb.from('loans').update(core).eq('id', key); if (error) console.warn('loan update', l.id, error.message); else prev.core = JSON.stringify(core); }
        if (ui !== prev.ui) { const { error } = await sb.from('loan_ui_state').upsert({ loan_id: key, org_id: G.orgId, data: { loan: l } }); if (error) console.warn('loan state', l.id, error.message); else prev.ui = ui; }
        if (l.borrower && prev.borrower !== l.borrower) {
          const parts = String(l.borrower).split('&')[0].trim().split(/\s+/); const first = parts.shift() || l.borrower; const last = parts.join(' ') || '-';
          const { data: b } = await sb.from('borrowers').select('id').eq('loan_id', key).eq('is_primary', true).maybeSingle();
          const r = b ? await sb.from('borrowers').update({ first_name: first, last_name: last }).eq('id', b.id) : await sb.from('borrowers').insert({ loan_id: key, org_id: G.orgId, is_primary: true, first_name: first, last_name: last });
          if (!r.error) prev.borrower = l.borrower;
        }
        snap.loans[key] = prev;
      }
      // removed loans (deleted in the LOS): the database keeps them; the screen hides them
      const orgData = { S: { ...S, loans: [], loanId: null, panel: false, layer: null } };
      const orgJson = JSON.stringify(orgData);
      if (orgJson !== snap.org) { const { error } = await sb.from('org_app_state').upsert({ org_id: G.orgId, data: orgData }); if (error) console.warn('org state', error.message); else snap.org = orgJson; }
      G.lastSaved = new Date(); G.error = null;
    } catch (e) { G.error = e.message; console.warn(e); }
    finally { G.saving = false; liveBadge(); }
  }
  G.scheduleSave = () => { clearTimeout(timer); timer = setTimeout(() => { inflight = inflight.then(syncNow); }, 1200); };
  G.flush = () => { clearTimeout(timer); inflight = inflight.then(syncNow); return inflight; };
  window.addEventListener('beforeunload', (e) => { if (G.saving || timer) { G.flush(); } });
  function liveBadge() { const el = document.getElementById('gn-live-badge'); if (!el) return;
    el.textContent = G.saving ? 'Saving…' : G.error ? 'Not saved — retrying' : G.lastSaved ? 'Saved' : 'Live'; el.className = 'gnl-badge ' + (G.error ? 'bad' : G.saving ? 'busy' : 'ok'); }

  window.GN_START = async function () {
    try {
      const { data: { session } } = await sb.auth.getSession(); if (!session) return location.replace('login.html');
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); if (aal.currentLevel !== 'aal2') return location.replace('login.html');
      const uid = session.user.id;
      const [{ data: prof }, { data: mem, error: me }] = await Promise.all([sb.from('profiles').select('*').eq('user_id', uid).single(), sb.from('memberships').select('org_id, role, organizations(name, settings)').eq('user_id', uid).eq('active', true)]);
      if (me) throw new Error(me.message);
      G.user = { id: uid, email: session.user.email, name: prof?.full_name || session.user.email, platformAdmin: !!prof?.is_platform_admin };
      if (!mem || !mem.length) { const el = loadingEl(); el.innerHTML = `<div class="gnl-card"><b>Your account is ready</b><p>You are signed in, but you are not part of a company yet. Ask your broker admin to invite <b>${G.user.email}</b>, then sign in again.</p><p><button id="gnl-out">Sign out</button></p></div>`; document.getElementById('gnl-out').onclick = async () => { await sb.auth.signOut(); location.replace('login.html'); }; return; }
      G.orgId = mem[0].org_id; G.orgName = mem[0].organizations?.name || 'Company'; G.docProvider = mem[0].organizations?.settings?.documents?.provider === 'propel' ? 'propel' : 'docmagic'; G.roles = mem.filter((m) => m.org_id === G.orgId).map((m) => m.role);
      const mapped = [...new Set(ROLE_ORDER.filter(([r]) => G.roles.includes(r)).map(([, p]) => p))]; if (G.user.platformAdmin) mapped.push('platform');
      G.uiRoles = mapped.length ? mapped : ['lo'];
      const [{ data: rows, error: le }, { data: ui }, { data: org }, { data: bor }, { data: lib }] = await Promise.all([
        sb.from('loans').select('*').eq('org_id', G.orgId).order('created_at', { ascending: false }).limit(1000),
        sb.from('loan_ui_state').select('loan_id, data').eq('org_id', G.orgId),
        sb.from('org_app_state').select('data').eq('org_id', G.orgId).maybeSingle(),
        sb.from('borrowers').select('loan_id, first_name, last_name').eq('org_id', G.orgId).eq('is_primary', true),
        sb.from('disclosure_library').select('code, docmagic_form_id, propel_form_id').eq('active', true)]);
      if (le) throw new Error(le.message);
      const uiBy = Object.fromEntries((ui || []).map((u) => [u.loan_id, u])); const borBy = Object.fromEntries((bor || []).map((b) => [b.loan_id, b]));
      const realLoans = (rows || []).map((r) => toPreview(r, uiBy[r.id], borBy[r.id]));
      rows?.forEach((r) => { const l = realLoans.find((x) => x.dbId === r.id); snap.loans[r.id] = { core: JSON.stringify(coreOf(l)), ui: uiBy[r.id] ? JSON.stringify(uiBy[r.id].data) : '', borrower: borBy[r.id] ? l.borrower : '' }; });
      G.firstRun = !org?.data?.S;
      try { localStorage.removeItem('gn-los-live'); if (!G.firstRun) localStorage.setItem('gn-los-live', JSON.stringify({ ...org.data.S, loans: realLoans, view: 'dashboard', loanId: null, layer: null, panel: false }) /* always open on the dashboard: the saved page may belong to another role */); localStorage.setItem('gn-los-role', G.uiRoles[0]); } catch {}
      G.realLoans = realLoans; G.status = 'ready';
      // document provider (DocMagic or Propel): the company choice lives in organizations.settings, changed only through the audited RPC
      G.docLib = lib || [];
      G.setDocProvider = async (p) => { const { error } = await sb.rpc('set_document_provider', { p_org: G.orgId, p_provider: p }); if (error) throw new Error(error.message); G.docProvider = p; };
      // start the LOS screens
      G.seedContacts = org?.data?.seedLenderContacts || null;
      const code = [...document.querySelectorAll('script[type="text/gn-app"]')].map((s) => s.textContent).join('\n;\n');
      (0, eval)(code);
      loadingEl()?.remove();
    } catch (e) { console.error(e); fail(e.message || 'Unexpected error'); }
  };
})();
