/**
 * 📡 Local JSON မှ ဒေါင်လိုက်စီထားသော ပွဲစဉ်ဒေတာများကို ဖတ်ယူပြီး
 * ဇယားကွက်ထဲသို့ Dynamic အရောင်ခြယ်စနစ်ဖြင့် ထည့်သွင်းပေးမည့် Function
 */
export function loadFixturesFromLocalJSON() {
  fetch('../fixtures.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(t => {
        const team = t.teamCode;
        
        // 💡 စနစ်သစ်: အသင်းတစ်သင်းချင်းစီအောက်က fixtures Array ထဲက ပွဲစဉ် ၃၈ ခုကို လှည့်ပတ်စစ်ဆေးခြင်း
        if (t.fixtures && Array.isArray(t.fixtures)) {
          t.fixtures.forEach(f => {
            const gw = f.gw;
            const cell = document.getElementById(`${team}-gw${gw}`);
            
            if (cell) {
              const opponentText = f.opponent ? String(f.opponent).trim() : "";
              const isHome = f.isHome;
              const fdrValue = f.fdr !== undefined ? String(f.fdr).trim() : "3";
              
              cell.style.padding = "0px"; 
              cell.style.borderColor = "rgba(30,106,60,0.15)";
              
              // 1️⃣ BGW (Blank Game Week) Logic
              // JSON ထဲမှာ opponent နေရာမှာ "BLANK" လို့ ရေးထားရင် အကွက်ကို မီးခိုးရောင် အလိုအလျောက် ပြောင်းပေးမည်
              if (opponentText === "BLANK" || opponentText === "—" || opponentText === "") {
                cell.innerHTML = `<div class="w-full h-full bg-gray-800 text-gray-500 font-bold flex items-center justify-center" style="min-height:38px; font-size:10px;">BLANK</div>`;
              }
              
              // 2️⃣ DGW (Double Game Week) Multi-Color Split Logic
              // JSON ထဲမှာ FDR ရော Opponent စာသားမှာပါ "+" ပါဝင်လာပါက အကွက်ကို အရောင်နှစ်မျိုး ခြမ်းပြပေးမည်
              else if (fdrValue.includes("+") && opponentText.includes("+")) {
                const partsFDR = fdrValue.split("+");
                const partsText = opponentText.split("+");
                
                const fdrA = partsFDR[0].trim();
                const fdrB = partsFDR[1].trim();
                
                // ပွဲစဉ်စာသား (H) သို့မဟုတ် (A) ကို အိမ်/အဝေး Logic အတိုင်း တွက်ချက်ခြင်း
                // မှတ်ချက် - ဤနေရာတွင် ဒေါင်လိုက် DGW အတွက် စာသားကို ရှင်းလင်းစွာ ခွဲထုတ်ပေးပါသည်
                const textA = partsText[0].trim();
                const textB = partsText[1].trim();
                
                // FDR Level အလိုက် သတ်မှတ်မည့် Hex အရောင်ကုဒ်များ
                const getColor = (fdr) => {
                  if (fdr === "1" || fdr === "2") return "#22c55e"; // Easy (🟢)
                  if (fdr === "3") return "#eab308";                // Normal (🟡)
                  return "#ef4444";                                  // Difficult (🔴)
                };

                const getTextColor = (fdr) => fdr === "3" ? "#041e12" : "#ffffff";

                cell.innerHTML = `
                  <div class="flex w-full h-full font-bold" style="min-height:38px; font-size:8px; line-height:1.1;">
                    <div class="w-1/2 flex items-center justify-center p-1 border-r border-black/10" style="background-color:${getColor(fdrA)}; color:${getTextColor(fdrA)};">${textA}</div>
                    <div class="w-1/2 flex items-center justify-center p-1" style="background-color:${getColor(fdrB)}; color:${getTextColor(fdrB)};">${textB}</div>
                  </div>
                `;
              } 
              
              // 3️⃣ Normal Single Match Logic (ပုံမှန် တစ်ပတ် တစ်ပွဲကစားမည့် စနစ်)
              else {
                // အိမ်ကွင်းဆိုလျှင် စာလုံးအကြီး (H) ၊ အဝေးကွင်းဆိုလျှင် စာလုံးအသေး (A) သတ်မှတ်ပြသခြင်း
                let matchText = isHome ? `${opponentText} (H)` : `${opponentText.toLowerCase()} (A)`;
                
                cell.innerHTML = `<div class="w-full h-full fdr-${fdrValue} flex items-center justify-center" style="min-height:38px; font-size:10px; padding:10px 4px;">${matchText}</div>`;
              }
            }
          });
        }
      });
    })
    .catch(err => console.error("Error loading fixtures JSON:", err));
}

/**
 * 🔍 အန်ကယ်ဖြစ်စေချင်သည့် အသင်း ၂၀ Dropdown Filter Filter စာရင်းကို 
 * Scout Drawer မျက်နှာပြင်ထဲသို့ လှလှပပ တည်ဆောက်ထည့်သွင်းပေးမည့် Function
 */
export function buildCustomDropdownOptions(plTeams) {
  const listEl = document.getElementById("team-options-list");
  if (listEl) {
    listEl.innerHTML = plTeams.map(t => `
      <div onclick="selectTeamFilter('${t.code}', '${t.name}')" class="p-3 rounded-xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition border border-[#1e6a3c]/30" style="background:#124c2a;">
        <span class="text-xs font-bold text-white">${t.name}</span>
        <span class="text-xs font-bold" style="color:#C9A84C;">⚽</span>
      </div>
    `).join("");
  }
}
