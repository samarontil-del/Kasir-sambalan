
import React, { useEffect, useMemo, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
// Optional firebase
// import { initializeApp } from 'firebase/app';
// import { getDatabase, ref as dbRef, set as dbSet, onValue, push as dbPush } from 'firebase/database';
import { FIREBASE_CONFIG } from './firebase-config';

// Toggle firebase usage here:
const USE_FIREBASE = false;

const currency = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(v || 0);
const nowISO = () => new Date().toISOString();

function sampleState() {
  const menu = [
    { id: 'm1', name: 'Ayam Goreng', price: 10000, stock: 32, cost: 6000 },
    { id: 'm2', name: 'Ayam Goreng Jumbo', price: 19000, stock: 12, cost: 11000 },
    { id: 'm3', name: 'Es Teh', price: 5000, stock: 120, cost: 1500 },
    { id: 'm4', name: 'Nila Bakar', price: 27000, stock: 8, cost: 15000 },
    { id: 'm5', name: 'Gurame Goreng', price: 35000, stock: 5, cost: 20000 },
    { id: 'm6', name: 'Tempe Mendoan', price: 8000, stock: 20, cost: 3000 },
  ];
  return { menu, sales: [], stockHistory: [], pending: [] };
}

// IndexedDB wrapper
async function openIDB(dbName = 'kasir_db', storeName = 'store') {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  try {
    const db = await openIDB();
    const tx = db.transaction('store', 'readonly');
    const st = tx.objectStore('store');
    return new Promise((res, rej) => {
      const r = st.get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } catch (e) { return null; }
}
async function idbSet(key, value) {
  try {
    const db = await openIDB();
    const tx = db.transaction('store', 'readwrite');
    const st = tx.objectStore('store');
    st.put(value, key);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) { return false; }
}

export default function FullKasirPOS() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0,10));
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [customerNote, setCustomerNote] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [selectedTrendMenu, setSelectedTrendMenu] = useState(null);
  const bcRef = useRef(null);

  useEffect(() => {
    (async ()=>{
      const stored = await idbGet('kasir_state');
      if (stored) setData(stored);
      else setData(sampleState());
      setLoaded(true);
    })();
    try {
      const bc = new BroadcastChannel('kasir_sync_channel');
      bcRef.current = bc;
      bc.onmessage = (ev) => {
        const { type, payload } = ev.data || {};
        if (type === 'sync_state' && payload) {
          setData(payload);
        }
      };
    } catch (e) { /* not supported */ }
    return () => { if (bcRef.current) bcRef.current.close(); };
  }, []);

  useEffect(() => {
    if (!data) return;
    idbSet('kasir_state', data);
    try { localStorage.setItem('kasir_state_backup', JSON.stringify(data)); } catch (e) {}
    if (bcRef.current) bcRef.current.postMessage({ type: 'sync_state', payload: data });
  }, [data]);

  const filteredMenu = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.menu.filter(m => m.name.toLowerCase().includes(q));
  }, [data, search]);

  const subtotal = cart.reduce((s,it)=> s + it.price * it.qty, 0);

  const top5 = useMemo(() => {
    if (!data) return [];
    const cnt = {};
    data.sales.forEach(s => s.items.forEach(it => cnt[it.id] = (cnt[it.id]||0) + it.qty));
    return Object.entries(cnt).map(([id, qty])=> ({ id, qty, name: (data.menu.find(m=>m.id===id)||{}).name || 'Unknown' })).sort((a,b)=>b.qty-a.qty).slice(0,5);
  }, [data]);

  const marginReport = useMemo(() => {
    if (!data) return [];
    const revenue = {};
    const cost = {};
    data.sales.forEach(s => s.items.forEach(it => {
      revenue[it.id] = (revenue[it.id]||0) + it.qty * it.price;
      const menuItem = data.menu.find(m=>m.id===it.id);
      const c = menuItem?.cost || 0;
      cost[it.id] = (cost[it.id]||0) + it.qty * c;
    }));
    const arr = Object.keys(revenue).map(id => ({ id, name: data.menu.find(m=>m.id===id)?.name||'Unknown', revenue: revenue[id], cost: cost[id] || 0, profit: (revenue[id] - (cost[id]||0)) }));
    return arr.sort((a,b) => b.profit - a.profit);
  }, [data]);

  const lowStock = useMemo(()=> data ? data.menu.filter(m => m.stock <=5 && m.stock>0) : [], [data]);

  function menuTrend(menuId, days=14) {
    if(!data) return [];
    const arr = [];
    for(let i=days-1;i>=0;i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0,10);
      const qty = data.sales.filter(s=> s.date.slice(0,10)===key).reduce((s,x)=> s + (x.items.find(it=>it.id===menuId)?.qty || 0), 0);
      arr.push({ date: key.slice(5), qty });
    }
    return arr;
  }

  function addToCart(menuItem) {
    if (menuItem.stock <= 0) return alert('Stok habis');
    setCart(c=>{
      const found = c.find(x=>x.id===menuItem.id);
      if(found) return c.map(x=> x.id===found.id ? {...x, qty: x.qty+1 } : x);
      return [...c, { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty:1 }];
    });
  }

  function changeQtyCart(index, delta) {
    setCart(c => c.map((it,i)=> i===index? {...it, qty: Math.max(0, it.qty+delta)}: it).filter(it => it.qty>0));
  }

  function parkOrder() {
    if(!cart.length) return alert('Keranjang kosong');
    const p = { id: 'P-'+Date.now(), items: cart, date: nowISO(), note: customerNote, table: tableNumber };
    setData(d=> ({ ...d, pending: [p, ...d.pending] }));
    setCart([]);
    setCustomerNote('');
    setTableNumber('');
  }

  function resumeOrder(pendingId) {
    const p = data.pending.find(x=>x.id===pendingId);
    if(!p) return;
    setCart(p.items);
    setData(d=> ({ ...d, pending: d.pending.filter(x=>x.id!==pendingId) }));
  }

  function addStock(menuId, qty, note='manual'){
    if(qty<=0) return;
    setData(d=>{
      const newMenu = d.menu.map(m=> m.id===menuId? {...m, stock: m.stock + qty} : m);
      const entry = { id: 'SH-'+Date.now(), date: nowISO(), menuId, menuName: d.menu.find(m=>m.id===menuId)?.name || '-', type: 'masuk', qty, note };
      return { ...d, menu: newMenu, stockHistory: [entry, ...d.stockHistory] };
    });
  }

  function checkout({ payment=0, method='Tunai' } = {}) {
    if(!cart.length) return alert('Keranjang kosong');
    const soldItems = cart.map(it=> ({ ...it }));
    const total = cart.reduce((s,it)=> s + it.price * it.qty, 0);
    const inv = { id: 'INV-'+Date.now(), date: nowISO(), items: soldItems, subtotal: total, total, payment, method, note: customerNote, table: tableNumber };

    setData(d=>{
      const newMenu = d.menu.map(m=>{
        const sold = soldItems.find(si=> si.id===m.id);
        if(sold) return { ...m, stock: Math.max(0, m.stock - sold.qty) };
        return m;
      });
      const stockEntries = soldItems.map(si=> ({ id: 'SH-'+Date.now()+'-'+si.id, date: nowISO(), menuId: si.id, menuName: d.menu.find(mm=>mm.id===si.id)?.name||'-', type: 'keluar', qty: si.qty, note: `Terjual (${inv.id})` }));
      return { ...d, menu: newMenu, sales: [inv, ...d.sales], stockHistory: [...stockEntries, ...d.stockHistory] };
    });

    setTimeout(()=> printReceipt(inv), 300);
    setCart([]);
    setCustomerNote('');
    setTableNumber('');
  }

  function printReceipt(inv) {
    const w = window.open('', 'STRUK', 'width=320,height=600');
    if(!w) return alert('Izinkan popup untuk mencetak');
    w.document.write(`<div style="font-family: sans-serif; padding:12px; width:280px;">`);
    w.document.write(`<h3 style="text-align:center; margin:0">Sambelan Caping Gunung</h3>`);
    w.document.write(`<div style="text-align:center; font-size:12px; color:#555">Struk: ${inv.id}<br/>${new Date(inv.date).toLocaleString()}</div>`);
    if(inv.table) w.document.write(`<div style="font-size:13px; font-weight:600">Meja: ${inv.table}</div>`);
    if(inv.note) w.document.write(`<div style="font-size:12px;">Catatan: ${inv.note}</div>`);
    w.document.write(`<hr/>`);
    inv.items.forEach(it=>{
      w.document.write(`<div style="display:flex; justify-content:space-between; font-size:14px; margin:6px 0"><div>${it.name} x${it.qty}</div><div>${currency(it.price*it.qty)}</div></div>`);
    });
    w.document.write(`<hr/>`);
    w.document.write(`<div style="display:flex; justify-content:space-between; font-weight:bold"> <div>Total</div><div>${currency(inv.total)}</div></div>`);
    w.document.write(`<div style="display:flex; justify-content:space-between;"> <div>Metode</div><div>${inv.method}</div></div>`);
    w.document.write(`<div style="display:flex; justify-content:space-between;"> <div>Dibayar</div><div>${currency(inv.payment)}</div></div>`);
    w.document.write(`<div style="display:flex; justify-content:space-between;"> <div>Kembali</div><div>${currency((inv.payment||0) - inv.total)}</div></div>`);
    w.document.write(`<hr/>`);
    w.document.write(`<div style="text-align:center; font-size:12px; color:#666">Terima kasih, datang kembali!</div>`);
    w.document.write(`</div>`);
    w.document.close(); w.focus(); w.print();
  }

  function exportExcel() {
    const salesSheet = data.sales.map(s => ({ id: s.id, date: s.date, total: s.total, method: s.method, table: s.table, note: s.note }));
    const stockSheet = data.stockHistory.map(h=> ({ id: h.id, date: h.date, menu: h.menuName, type: h.type, qty: h.qty, note: h.note }));
    const menuSheet = data.menu.map(m=> ({ id: m.id, name: m.name, price: m.price, cost: m.cost, stock: m.stock }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesSheet), 'Penjualan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockSheet), 'Riwayat Stok');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(menuSheet), 'Menu');
    XLSX.writeFile(wb, `Laporan_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  function dailyAlert(date = new Date().toISOString().slice(0,10)){
    if(!data) return;
    const sales = data.sales.filter(s=> s.date.slice(0,10)===date);
    const omzet = sales.reduce((s,x)=> s + x.total, 0);
    const tx = sales.length;
    const top = sales.flatMap(s=> s.items).reduce((acc,it)=> { acc[it.id] = (acc[it.id]||0)+it.qty; return acc;}, {});
    const topArr = Object.entries(top).map(([id,qty])=> ({ id, name: data.menu.find(m=>m.id===id)?.name||'Unknown', qty})).sort((a,b)=>b.qty-a.qty).slice(0,3);
    alert(`Ringkasan ${date}\\nOmzet: ${currency(omzet)}\\nTransaksi: ${tx}\\nTop: ${topArr.map(t=> t.name+ ' x'+t.qty).join(', ')}`);
  }

  if(!loaded || !data) return <div className="p-6">Memuat data...</div>;

  const chartDays = useMemo(()=>{
    const days = [];
    for(let i=13;i>=0;i--){
      const d = new Date(); d.setDate(d.getDate()-i); const key = d.toISOString().slice(0,10);
      const total = data.sales.filter(s=> s.date.slice(0,10)===key).reduce((sum,s)=> sum + s.total, 0);
      days.push({ date: key.slice(5), omzet: total });
    }
    return days;
  }, [data]);

  const trendData = selectedTrendMenu ? menuTrend(selectedTrendMenu, 14) : [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Kasir Sambelan Caping Gunung</h1>
            <div className="text-sm text-gray-500">Offline + Local Sync + Cloud-ready</div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={exportExcel} className="px-3 py-2 bg-green-600 text-white rounded">Export Excel</button>
            <button onClick={()=>dailyAlert(selectedDate)} className="px-3 py-2 border rounded">Ringkasan Harian</button>
            <button onClick={()=>{ localStorage.removeItem('kasir_state'); idbSet('kasir_state', null).then(()=>window.location.reload()); }} className="px-3 py-2 border rounded">Reset</button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <section className="lg:col-span-3 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-2xl shadow">
                <div className="text-xs text-gray-500">Omzet Hari ({selectedDate})</div>
                <div className="mt-2 text-2xl font-bold">{currency(data.sales.filter(s=> s.date.slice(0,10)===selectedDate).reduce((a,b)=>a+b.total,0))}</div>
                <div className="text-sm text-gray-500 mt-1">Transaksi hari ini: {data.sales.filter(s=> s.date.slice(0,10)===selectedDate).length}</div>
              </div>

              <div className="p-4 bg-white rounded-2xl shadow">
                <div className="text-xs text-gray-500">Top Margin (Paling Untung)</div>
                <div className="mt-2 text-base font-semibold">{(marginReport[0] && `${marginReport[0].name} • ${currency(marginReport[0].profit)}`) || 'Belum ada penjualan'}</div>
                <div className="text-xs text-gray-500 mt-1">Lihat laporan margin untuk detail</div>
              </div>

              <div className="p-4 bg-white rounded-2xl shadow">
                <div className="text-xs text-gray-500">Alert Stok Menipis</div>
                {lowStock.length===0 ? <div className="text-sm mt-2 text-gray-500">Semua stok aman</div> : (
                  <ul className="mt-2 text-sm">
                    {lowStock.map(ls=> <li key={ls.id} className="text-yellow-700">{ls.name} (sisa {ls.stock})</li>)}
                  </ul>
                )}
                <div className="text-xs text-gray-500 mt-2">Setting: peringatan saat sisa ≤ 5</div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow">
              <h3 className="font-semibold mb-2">Grafik Omzet (14 hari)</h3>
              <div style={{width: '100%', height: 220}} className="mb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartDays} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorOmzet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6EE7B7" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#6EE7B7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" />
                    <YAxis />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip />
                    <Area type="monotone" dataKey="omzet" stroke="#10B981" fillOpacity={1} fill="url(#colorOmzet)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Pilih menu untuk lihat tren</h4>
                  <select onChange={(e)=> setSelectedTrendMenu(e.target.value || null)} className="border rounded px-3 py-2 w-full">
                    <option value="">-- Pilih Menu --</option>
                    {data.menu.map(m=> <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                <div className="h-36 bg-gray-50 rounded p-3">
                  {selectedTrendMenu ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="qty" stroke="#6366F1" fill="#E9D5FF" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-sm text-gray-500">Pilih menu untuk menampilkan grafik tren penjualan per menu</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Menu & Stok</h3>
                <div className="flex items-center gap-2">
                  <input placeholder="Cari menu..." value={search} onChange={(e)=>setSearch(e.target.value)} className="border rounded px-3 py-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredMenu.map(m=> (
                  <div key={m.id} className="p-3 border rounded-lg flex flex-col justify-between bg-gradient-to-b from-white to-gray-50">
                    <div>
                      <div className="font-semibold">{m.name}</div>
                      <div className="text-sm text-gray-500">{currency(m.price)}</div>
                      <div className="text-xs text-gray-500">HPP (estimasi): {currency(m.cost)}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${m.stock>10? 'bg-green-100 text-green-700': m.stock>0? 'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>
                          Sisa {m.stock}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button disabled={m.stock<=0} onClick={()=>addToCart(m)} className={`px-3 py-1 rounded ${m.stock>0? 'bg-indigo-600 text-white':'bg-gray-200 text-gray-400'}`}>Tambah</button>
                        <button onClick={()=>{ const q = Number(prompt('Tambah stok berapa?', '10')); if(q>0) addStock(m.id, q); }} className="px-2 py-1 border rounded">+Stok</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </section>

          <aside className="space-y-4">
            <div className="bg-white p-4 rounded-2xl shadow w-80">
              <h3 className="font-semibold mb-2">Keranjang</h3>
              <div className="text-sm text-gray-500 mb-2">Meja: <input value={tableNumber} onChange={(e)=>setTableNumber(e.target.value)} className="ml-2 border rounded px-2" style={{width: 80}} /></div>
              <div className="text-sm text-gray-500 mb-2">Catatan: <input value={customerNote} onChange={(e)=>setCustomerNote(e.target.value)} className="ml-2 border rounded px-2" style={{width:160}} /></div>
              <div className="space-y-2 max-h-60 overflow-auto">
                {cart.length===0 && <div className="text-sm text-gray-500">Keranjang kosong</div>}
                {cart.map((it, idx)=> (
                  <div key={idx} className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-gray-500">{it.qty} x {currency(it.price)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={()=>changeQtyCart(idx,-1)} className="px-2 py-1 border rounded">-</button>
                      <button onClick={()=>changeQtyCart(idx,1)} className="px-2 py-1 border rounded">+</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">{currency(subtotal)}</span></div>
                <div className="mt-2">
                  <label className="text-xs mr-2">Metode</label>
                  <select value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)} className="border rounded px-2 py-1">
                    <option value="Tunai">Tunai</option>
                    <option value="QRIS">QRIS</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={()=>checkout({ payment: subtotal, method: paymentMethod })} className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded">Bayar & Cetak</button>
                  <button onClick={parkOrder} className="flex-1 border px-3 py-2 rounded">Parkir Nota</button>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow w-80">
              <h3 className="font-semibold mb-2">Riwayat Stok (Terbaru)</h3>
              <div className="text-sm max-h-48 overflow-auto space-y-2">
                {data.stockHistory.length===0 && <div className="text-gray-500">Belum ada riwayat stok</div>}
                {data.stockHistory.slice(0,12).map(h=> (
                  <div key={h.id} className="flex justify-between items-center">
                    <div className="text-sm">
                      <div className="font-medium">{h.menuName}</div>
                      <div className="text-xs text-gray-500">{new Date(h.date).toLocaleString()}</div>
                    </div>
                    <div className={`text-sm font-semibold ${h.type==='masuk' ? 'text-green-600' : 'text-red-600'}`}>{h.type==='masuk'? `+${h.qty}` : `-${h.qty}`}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow w-80">
              <h3 className="font-semibold mb-2">Pending Orders</h3>
              <div className="text-sm max-h-48 overflow-auto space-y-2">
                {data.pending.length===0 && <div className="text-gray-500">Tidak ada pending</div>}
                {data.pending.map(p=> (
                  <div key={p.id} className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{p.id} • Meja {p.table || '-'} </div>
                      <div className="text-xs text-gray-500">{p.items.length} item</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={()=>resumeOrder(p.id)} className="px-2 py-1 border rounded">Resume</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </aside>
        </main>

        <footer className="mt-8 text-center text-xs text-gray-500">Kasir POS • Offline-ready • Local-sync • Cloud-ready • Sambelan Caping Gunung</footer>
      </div>
    </div>
  );
}
