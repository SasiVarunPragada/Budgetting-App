import React, { useEffect, useMemo, useState } from 'react';

/**
 * PaisaPal — Student/Young Professional Budgeting App
 * Features:
 * - Monthly budgets per category
 * - Track income/expenses with mood tags
 * - Save common items with quick-add
 * - Auto-repeat saved items (daily/weekly/monthly)
 * - LocalStorage persistence
 * - CSV export
 */

const DEFAULT_CATEGORIES = ['Rent','Groceries','Transport','Entertainment','Bills','Savings'];
const DEFAULT_MOODS = ['Happy','Stressed','Bored','Excited','Neutral'];

const STORAGE_KEY = 'paisa-pal-v1';

function fmtGBP(n){ try { return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n||0)} catch{ return '£'+(n||0).toFixed(2);} }
function today(){ return new Date().toISOString().slice(0,10); }
function yyyymm(d){ const x=new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'); }
function addDays(dateStr, days){ const d=new Date(dateStr); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
function addMonths(dateStr, months){ const d=new Date(dateStr); d.setMonth(d.getMonth()+months); return d.toISOString().slice(0,10); }

export default function App(){
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [moods] = useState(DEFAULT_MOODS);
  const [selectedMonth, setSelectedMonth] = useState(yyyymm(today()));
  const [budgets, setBudgets] = useState({}); // { '2025-08': { Groceries: 200, ... } }
  const [transactions, setTransactions] = useState([]); // {id,date,type,category,description,amount,mood,savedId?}
  const [savedItems, setSavedItems] = useState([]); // {id,name,amount,category,mood,repeat,nextDue}

  // Load
  useEffect(()=>{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      try {
        const parsed = JSON.parse(raw);
        parsed.categories && setCategories(parsed.categories);
        parsed.selectedMonth && setSelectedMonth(parsed.selectedMonth);
        parsed.budgets && setBudgets(parsed.budgets);
        parsed.transactions && setTransactions(parsed.transactions);
        parsed.savedItems && setSavedItems(parsed.savedItems);
      } catch(e){}
    }
  },[]);

  // Save
  useEffect(()=>{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ categories, selectedMonth, budgets, transactions, savedItems }));
  }, [categories, selectedMonth, budgets, transactions, savedItems]);

  // Auto-apply recurring saved items on load and when opening app on new day
  useEffect(()=>{
    const tdy = today();
    let changed = false;
    const newTransactions = [...transactions];
    const newSaved = savedItems.map(item => ({...item}));
    for(let i=0;i<newSaved.length;i++){
      const item = newSaved[i];
      if(!item.repeat || item.repeat==='none') continue;
      if(!item.nextDue) item.nextDue = tdy;
      // keep adding occurrences until nextDue is in the future
      while(item.nextDue <= tdy){
        newTransactions.push({
          id: cryptoRandom(),
          date: item.nextDue,
          type: 'Expense',
          category: item.category,
          description: item.name,
          amount: Number(item.amount||0),
          mood: item.mood || 'Neutral',
          savedId: item.id
        });
        // advance nextDue
        if(item.repeat==='daily') item.nextDue = addDays(item.nextDue, 1);
        else if(item.repeat==='weekly') item.nextDue = addDays(item.nextDue, 7);
        else if(item.repeat==='monthly') item.nextDue = addMonths(item.nextDue, 1);
        changed = true;
      }
    }
    if(changed){
      setTransactions(newTransactions);
      setSavedItems(newSaved);
    }
    // eslint-disable-next-line
  }, []);

  const monthTx = useMemo(()=> transactions.filter(t => yyyymm(t.date)===selectedMonth), [transactions, selectedMonth]);

  const totals = useMemo(()=>{
    const income = monthTx.filter(t=>t.type==='Income').reduce((s,t)=>s+Number(t.amount||0),0);
    const expenses = monthTx.filter(t=>t.type==='Expense').reduce((s,t)=>s+Number(t.amount||0),0);
    return { income, expenses, net: income - expenses };
  }, [monthTx]);

  const categorySpend = useMemo(()=>{
    const map = {}; categories.forEach(c=> map[c]=0);
    monthTx.filter(t=>t.type==='Expense').forEach(t=>{ map[t.category] = (map[t.category]||0) + Number(t.amount||0); });
    return map;
  }, [monthTx, categories]);

  const moodSpend = useMemo(()=>{
    const map = {}; moods.forEach(m=> map[m]=0);
    monthTx.filter(t=>t.type==='Expense').forEach(t=>{ map[t.mood||'Neutral'] = (map[t.mood||'Neutral']||0) + Number(t.amount||0); });
    return map;
  }, [monthTx, moods]);

  const monthBudgets = budgets[selectedMonth] || {};

  function cryptoRandom(){ try { return crypto.randomUUID(); } catch { return String(Date.now()+Math.random()); } }

  function addTransaction(e){
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tx = {
      id: cryptoRandom(),
      date: fd.get('date') || today(),
      type: fd.get('type'),
      category: fd.get('category'),
      description: fd.get('description') || '',
      amount: Number(fd.get('amount')||0),
      mood: fd.get('mood') || 'Neutral'
    };
    setTransactions(prev => [tx, ...prev]);
    e.currentTarget.reset();
  }

  function removeTransaction(id){ setTransactions(prev => prev.filter(t=>t.id!==id)); }

  function updateBudget(category, value){
    setBudgets(prev => ({
      ...prev,
      [selectedMonth]: { ...(prev[selectedMonth]||{}), [category]: Number(value||0) }
    }));
  }

  function addCategory(){
    const name = prompt('New category name');
    if(!name) return;
    if(categories.includes(name)) return alert('Category already exists.');
    setCategories(prev => [...prev, name]);
  }

  function exportCSV(){
    const header = ['id','date','type','category','description','mood','amount'].join(',');
    const lines = transactions.map(t => [t.id,t.date,t.type,t.category,(t.description||'').replaceAll(',',' '),t.mood,Number(t.amount||0)].join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='transactions.csv'; a.click(); URL.revokeObjectURL(url);
  }

  function addSavedItem(e){
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const item = {
      id: cryptoRandom(),
      name: fd.get('name'),
      amount: Number(fd.get('samount')||0),
      category: fd.get('scategory'),
      mood: fd.get('smood') || 'Neutral',
      repeat: fd.get('repeat'),
      nextDue: fd.get('repeat')==='none' ? null : today()
    };
    if(!item.name || !item.amount || !item.category) { alert('Fill name, amount, category'); return; }
    setSavedItems(prev => [item, ...prev]);
    e.currentTarget.reset();
  }

  function quickAdd(item){
    const tx = {
      id: cryptoRandom(),
      date: today(),
      type: 'Expense',
      category: item.category,
      description: item.name,
      amount: Number(item.amount||0),
      mood: item.mood || 'Neutral',
      savedId: item.id
    };
    setTransactions(prev => [tx, ...prev]);
  }

  // month options: previous 6, current, next 6
  const monthOptions = useMemo(()=>{
    const arr=[]; const base=new Date(); base.setMonth(base.getMonth()-6);
    for(let i=0;i<13;i++){ const d=new Date(base.getFullYear(), base.getMonth()+i, 1); const k=yyyymm(d); const label=d.toLocaleString('en-GB',{month:'long',year:'numeric'}); arr.push({key:k,label}); }
    return arr;
  },[]);

  return (
    <div className="container">
      <div className="header card">
        <div>
          <div className="h1">PaisaPal — Budget App</div>
          <div className="sub">Track income, expenses, moods, and recurring items.</div>
        </div>
        <div className="inline">
          <select className="select" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>
            {monthOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button className="btn gray" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {/* Stats */}
      <div className="row row-3">
        <div className="card"><div className="small">Income</div><div className="stat">{fmtGBP(totals.income)}</div></div>
        <div className="card"><div className="small">Expenses</div><div className="stat">{fmtGBP(totals.expenses)}</div></div>
        <div className="card"><div className="small">Net</div><div className="stat">{fmtGBP(totals.net)}</div></div>
      </div>

      {/* Budgets */}
      <div className="card">
        <div className="header">
          <div className="h1" style={{fontSize:18}}>Monthly Budgets</div>
          <button className="btn gray" onClick={addCategory}>+ Add Category</button>
        </div>
        <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))'}}>
          {categories.map(cat => {
            const spent = categorySpend[cat]||0; const b = Number(monthBudgets[cat]||0);
            const pct = Math.min(100, Math.round((spent/(b||1))*100));
            return (
              <div key={cat} className="card" style={{padding:12}}>
                <div className="kv"><strong>{cat}</strong><input className="input" type="number" min="0" step="1" value={b} onChange={e=>updateBudget(cat, e.target.value)} placeholder="Budget"/></div>
                <div className={spent>b ? 'progress over' : 'progress'}><div style={{width: pct+'%'}}/></div>
                <div className="kv"><span>Spent: {fmtGBP(spent)}</span><span>Budget: {fmtGBP(b)}</span></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Transaction */}
      <div className="card">
        <div className="h1" style={{fontSize:18}}>Add Transaction</div>
        <form onSubmit={addTransaction} className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>
          <input className="input" name="date" type="date" defaultValue={today()} />
          <select className="select" name="type"><option>Expense</option><option>Income</option></select>
          <select className="select" name="category">{categories.map(c => <option key={c}>{c}</option>)}</select>
          <select className="select" name="mood">{moods.map(m => <option key={m}>{m}</option>)}</select>
          <input className="input" name="description" placeholder="Description" />
          <input className="input" name="amount" type="number" step="0.01" placeholder="Amount" />
          <button className="btn">Add</button>
        </form>
      </div>

      {/* Saved Items */}
      <div className="card">
        <div className="h1" style={{fontSize:18}}>Saved Items & Auto-Repeat</div>
        <form onSubmit={addSavedItem} className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>
          <input className="input" name="name" placeholder="Name (e.g., Bus Fare)" />
          <input className="input" name="samount" type="number" step="0.01" placeholder="Amount" />
          <select className="select" name="scategory">{categories.map(c => <option key={c}>{c}</option>)}</select>
          <select className="select" name="smood">{moods.map(m => <option key={m}>{m}</option>)}</select>
          <select className="select" name="repeat">
            <option value="none">No Repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button className="btn green">Save Item</button>
        </form>
        <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', marginTop:12}}>
          {savedItems.map(item => (
            <div key={item.id} className="card" style={{padding:12}}>
              <div className="kv"><strong>{item.name}</strong><span className="badge">{item.repeat}</span></div>
              <div className="small">{item.category} • {item.mood}</div>
              <div className="kv"><span>Amount</span><strong>{fmtGBP(item.amount)}</strong></div>
              <button className="btn gray" onClick={()=>quickAdd(item)}>+ Quick Add</button>
            </div>
          ))}
        </div>
      </div>

      {/* Transactions */}
      <div className="card">
        <div className="h1" style={{fontSize:18}}>Transactions ({monthTx.length})</div>
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Mood</th><th>Description</th><th className="right">Amount</th><th></th></tr></thead>
            <tbody>
              {monthTx.map(t => (
                <tr key={t.id}>
                  <td>{new Date(t.date).toLocaleDateString('en-GB')}</td>
                  <td>{t.type}</td>
                  <td>{t.category}</td>
                  <td>{t.mood}</td>
                  <td>{t.description}</td>
                  <td className="right">{fmtGBP(t.type==='Expense' ? -t.amount : t.amount)}</td>
                  <td><button className="btn red" onClick={()=>removeTransaction(t.id)}>Delete</button></td>
                </tr>
              ))}
              {monthTx.length===0 && <tr><td colSpan="7" className="small">No transactions yet. Add one above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mood Insights */}
      <div className="card">
        <div className="h1" style={{fontSize:18}}>Mood Insights</div>
        <div className="grid grid-3">
          {moods.map(m => (
            <div key={m} className="card">
              <div className="kv"><strong>{m}</strong><span>{fmtGBP(moodSpend[m]||0)}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="small" style={{textAlign:'center', marginTop:24}}>
        Built with ❤️ — Runs entirely in your browser. Data saved to this device.
      </div>
    </div>
  );
}
