// This file contains the JavaScript code for the Arabex Coin project. 
// It handles the functionality of the webpage, including wallet connection, presale interactions, and countdown logic.

const TOKEN_SYMBOL = "ARX";
const TOKEN_DECIMALS = 18;
// غيّر المسار أدناه لوغو لوجو العملة على موقعك
const TOKEN_IMAGE = "https://arabexcoin.com/assets/img/arabex-logo.png";
const PRESALE   = "0x762438b37de78Ebbdeeac6D5F6Cf85f6F002E0aF";
const TOKEN     = "0x3A18719De55E2b9420beec4E1B03852e4cd7c46c"; 
const PRESALE_START = 1756684800 * 1000;

const BSC_PARAMS = {
  chainId: "0x38", 
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"]
};

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
  const btn = document.getElementById('openMetaMaskBtn');
  if (btn) btn.style.display = 'inline-block';
}

const PRESALE_ABI = [
  "function buy() external payable",
  "function claim() external",
  "function lockedBalanceOf(address) view returns (uint256 totalLocked, uint256 nextUnlockTime)"
];
const PRESALE_BUY_WITH_BNB_ABI = ["function buyWithBNB() payable"];

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('tokenAddr');
  if (el) el.textContent = TOKEN;
});

let provider, signer, presaleContract;

async function ensureBSC() {
  if (!window.ethereum) throw new Error("MetaMask is not installed");
  const chainId = await ethereum.request({ method: 'eth_chainId' });
  if (chainId !== BSC_PARAMS.chainId) {
    try {
      await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_PARAMS.chainId }] });
    } catch (switchErr) {
      if (switchErr.code === 4902) {
        await ethereum.request({ method: 'wallet_addEthereumChain', params: [BSC_PARAMS] });
      } else {
        throw switchErr;
      }
    }
  }
}
async function importARXToken() {
  if (!window.ethereum) return false;
  try {
    const wasAdded = await ethereum.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: TOKEN,         // مثال: 0x3A18719De55E2b9420beec4E1B03852e4cd7c46c
          symbol: TOKEN_SYMBOL,   // "ARX"
          decimals: TOKEN_DECIMALS,
          image: TOKEN_IMAGE
        }
      }
    });
    if (wasAdded) {
      console.log("ARX token added to wallet.");
      return true;
    } else {
      console.log("User dismissed token import.");
      return false;
    }
  } catch (e) {
    console.error("watchAsset error:", e);
    return false;
  }
}

async function  connectWallet() {
  try {
    if (!window.ethereum) {
      if (isMobile) {
        openInMetaMaskMobile();
        setTimeout(() => {
          alert("If MetaMask did not open, please open the MetaMask app, tap the menu, choose 'Browser', and type arabexcoin.com.");
        }, 1200);
        return;
      }
      alert("MetaMask is not detected. On mobile, please open this site inside the MetaMask app browser (Menu → Browser → type arabexcoin.com). On desktop, install MetaMask extension.");
      return;
    }
    await ensureBSC();
    await ethereum.request({ method: "eth_requestAccounts" });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    presaleContract = new ethers.Contract(PRESALE, PRESALE_ABI, signer);
    const addr = await signer.getAddress();
    document.getElementById('connectBtn').textContent = `Connected: ${addr.slice(0,6)}…${addr.slice(-4)}`;
    // document.getElementById('buyBtn').disabled = false;
    document.getElementById('buyBNBBtn').disabled = false;

    document.getElementById('claimBtn').disabled = false;
    document.getElementById('watchBtn').disabled = false;
    alert("Wallet connected on BNB Smart Chain");
    await refreshLockedInfo();

    importARXToken();
  } catch (err) {
    console.error(err);
    alert("Failed to connect wallet: " + (err?.message || err));
  }
}

const BNB_USD_FEED = "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE";
const FEED_ABI = [
  "function latestRoundData() view returns (uint80, int256 answer, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)"
];

async function quoteBnbForUsd(usdStr) {
  if (!provider) await connectWallet();
  const feed = new ethers.Contract(BNB_USD_FEED, FEED_ABI, provider);
  const [dec, round] = await Promise.all([
    feed.decimals(),
    feed.latestRoundData()
  ]);
  const price = round.answer;
  const usd = ethers.utils.parseUnits(usdStr, dec);
  const bnbWei = usd.mul(ethers.constants.WeiPerEther).div(price);
  return bnbWei;
}

async function buyPresaleUSD() {
  try {
    if (!presaleContract) await connectWallet();
    if (Date.now() < PRESALE_START) { alert("Presale starts soon."); return; }

    const usdStr = prompt("Enter USD/USDT amount (e.g. 100):", "");
    if (!usdStr) return;
    if (isNaN(Number(usdStr)) || Number(usdStr) <= 0) { alert("Invalid USD amount"); return; }

    const value = await quoteBnbForUsd(usdStr);
    const balance = await signer.getBalance();
    const bnbEth = ethers.utils.formatEther(value);
    const arxExpected = (Number(usdStr) * 1000).toLocaleString(); 

    if (balance.lt(value)) {
      alert(`Insufficient BNB balance in your wallet to buy ${arxExpected} ARX`);
      return;
    }

    if (!confirm(`You will send ~${bnbEth} BNB and receive about ${arxExpected} ARX`)) return;

    try {
      const presale1 = new ethers.Contract(PRESALE, PRESALE_BUY_WITH_BNB_ABI, signer);
      const tx = await presale1.buyWithBNB({ value });
      alert("Tx sent: " + tx.hash);
      await tx.wait();
      alert("Purchase confirmed!");
    } catch (e1) {
      const tx2 = await presaleContract.buy({ value });
      alert("Tx sent: " + tx2.hash);
      await tx2.wait();
      alert("Purchase confirmed!");
      await refreshLockedInfo();

    }
  } catch (err) {
    console.error(err);
    alert("Buy failed: " + (err?.message || err));
  }
}

// Get live BNB price in USD
async function getLiveBNBPrice() {
  if (!provider) await connectWallet();
  const feed = new ethers.Contract(BNB_USD_FEED, FEED_ABI, provider);
  const [dec, round] = await Promise.all([
    feed.decimals(),
    feed.latestRoundData()
  ]);
  const price = Number(round.answer) / (10 ** dec); // price in USD
  return price;
}

async function buyPresaleBNB() {
  try {
    if (!presaleContract) await connectWallet();
    if (Date.now() < PRESALE_START) { alert("Presale starts soon."); return; }

    const bnbStr = prompt("Enter BNB amount (e.g. 0.1):", "");
    if (!bnbStr) return;
    if (isNaN(Number(bnbStr)) || Number(bnbStr) <= 0) { alert("Invalid BNB amount"); return; }

    const value = ethers.utils.parseEther(bnbStr);
    const balance = await signer.getBalance();
        
    const price = await getLiveBNBPrice(); // price in USD
    const bnbAmount = Number(bnbStr);
    const usdValue = bnbAmount * price;
    const arxExpected = usdValue * 1000; // If 1 USD = 1000 ARX

    if (balance.lt(value)) {
      alert(`Insufficient BNB balance in your wallet to buy ${arxExpected.toLocaleString()} ARX`);
      return;
    }

    // 🟢 تقدير الغاز
    const presale1 = new ethers.Contract(PRESALE, PRESALE_BUY_WITH_BNB_ABI, signer);
    let gasLimit;
    try {
      gasLimit = await presale1.estimateGas.buyWithBNB({ value });
    } catch (err) {
      console.warn("estimateGas failed, using fallback 300000", err);
      gasLimit = ethers.BigNumber.from("300000"); // قيمة افتراضية
    }
    // const gasLimit = await presale1.estimateGas.buyWithBNB({ value });
    const gasPrice = await provider.getGasPrice();
    const gasFeeWei = gasLimit.mul(gasPrice);
    const gasFeeBNB = parseFloat(ethers.utils.formatEther(gasFeeWei));
    const gasFeeUSD = gasFeeBNB * price;

    if (!confirm(
      `You will send ${bnbStr} BNB (~$${usdValue.toFixed(2)})\n` +
      `Receive about ${arxExpected.toLocaleString()} ARX\n\n` +
      `Estimated Gas Fee: ${gasFeeBNB.toFixed(6)} BNB (~$${gasFeeUSD.toFixed(2)})`
    )) return;
    // if (!confirm(`You will send ${bnbStr} BNB (~$${usdValue.toFixed(2)}) and receive about ${arxExpected.toLocaleString()} ARX`)) return;

    try {
      const presale1 = new ethers.Contract(PRESALE, PRESALE_BUY_WITH_BNB_ABI, signer);
      const tx = await presale1.buyWithBNB({ value });
      alert("Tx sent: " + tx.hash);
      await tx.wait();
      alert("Purchase confirmed!");
    } catch (e1) {
      const tx2 = await presaleContract.buy({ value });
      alert("Tx sent: " + tx2.hash);
      await tx2.wait();
      alert("Purchase confirmed!");
      await refreshLockedInfo();

    }
  } catch (err) {
    console.error(err);
    alert("Buy failed: " + (err?.message || err));
  }
}

// ABI محدَّث ليرجع tuple
const PRESALE_ABI_VIEW = [
  "function lockedBalanceOf(address) view returns (uint256 totalLocked, uint256 nextUnlockTime)",
  "function saleActive() view returns (bool)",
  "function presaleEnd() view returns (uint256)",
  "function claim()"
];

// تنسيق مبسط
function fmt(num, dec=2) {
  const n = Number(num);
  return isNaN(n) ? "0" : n.toLocaleString(undefined,{maximumFractionDigits:dec});
}
function fmtCountdown(secs) {
  if (secs < 0) secs = 0;
  const d = Math.floor(secs/86400);
  const h = Math.floor((secs%86400)/3600);
  const m = Math.floor((secs%3600)/60);
  const s = Math.floor(secs%60);
  if (d>0) return `${d}d ${h}h ${m}m`;
  if (h>0) return `${h}h ${m}m ${s}s`;
  if (m>0) return `${m}m ${s}s`;
  return `${s}s`;
}

let _unlockTimer = null;

// قراءة الرصيد المقفول وتحديث الواجهة
async function refreshLockedInfo() {
  try {
    if (!window.ethereum || !provider) return;
    const addr = await signer.getAddress();

    const presaleRead = new ethers.Contract(PRESALE, PRESALE_ABI_VIEW, provider);
    const { totalLocked, nextUnlockTime } = await presaleRead.lockedBalanceOf(addr);

    const box = document.getElementById('lockedBox');
    const txt = document.getElementById('lockedInfo');
    const unt = document.getElementById('unlockInfo');

    // أوقف أي عدّاد سابق
    if (_unlockTimer) { clearInterval(_unlockTimer); _unlockTimer = null; }

    if (totalLocked.isZero()) {
      box.style.display = 'block';
      txt.textContent = "رصيدك المقفول: 0 ARX";
      unt.textContent = "عند الشراء سيتم إظهار وقت الفتح هنا.";
      return;
    }

    const lockedStr = ethers.utils.formatUnits(totalLocked, 18);
    box.style.display = 'block';
    txt.textContent = `رصيدك المقفول: ${fmt(lockedStr, 4)} ARX`;

    const unlockAt = nextUnlockTime.toNumber();
    const updateCountdown = () => {
      const now = Math.floor(Date.now()/1000);
      const left = unlockAt - now;
      if (left <= 0) {
        unt.textContent = "تم فتح الاستلام — يمكنك الضغط على Claim.";
        clearInterval(_unlockTimer); _unlockTimer = null;
      } else {
        const dateStr = new Date(unlockAt*1000).toLocaleString();
        unt.textContent = `يفتح الاستلام بعد: ${fmtCountdown(left)} ( ${dateStr} )`;
      }
    };
    updateCountdown();
    _unlockTimer = setInterval(updateCountdown, 1000);

  } catch (e) {
    console.log("refreshLockedInfo error:", e);
  }
}


function fmtTimeLeft(secLeft) {
  const h = Math.floor(secLeft/3600);
  const m = Math.floor((secLeft%3600)/60);
  const s = secLeft%60;
  return `${h}h ${m}m ${s}s`;
}

async function claimARX() {
  try {
    if (!presaleContract) await connectWallet();
    const me = await signer.getAddress();

    // استخدم عقد قراءة منفصل لضمان ABI الصحيح
    const presaleRead = new ethers.Contract(PRESALE, PRESALE_ABI_VIEW, provider);
    const { totalLocked, nextUnlockTime } = await presaleRead.lockedBalanceOf(me);

    if (totalLocked.isZero()) {
      alert("Nothing to claim yet (locked value = 0).");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const unlockAt = nextUnlockTime.toNumber();

    if (now < unlockAt) {
      alert(
        `you have ${ethers.utils.formatUnits(totalLocked, 18)} ARX in your wallet.\n` +
        `collect it after : ${fmtTimeLeft(unlockAt - now)}`
      );
      return;
    }

    // تحقق اختياري: بعض العقود تمنع المطالبة أثناء البيع
    let active = null, endTs = null;
    try { active = await presaleRead.saleActive(); } catch {}
    try { endTs = await presaleRead.presaleEnd(); } catch {}
    if (active === true && endTs && now < endTs.toNumber()) {
      alert("presale period not ended yet.");
      return;
    }

    // نفّذ المطالبة
    const tx = await presaleContract.claim();
    alert("Claim sent: " + tx.hash);
    await tx.wait();
    alert("Claimed! ستظهر ARX في محفظتك.");
  } catch (err) {
    console.error(err);
    alert("Claim failed: " + (err?.error?.message || err?.message || String(err)));
  }
}

// async function claimARX() {
//   try {
//     if (!presaleContract) await connectWallet();
//     const me = await signer.getAddress();
//     const info = await presaleContract.lockedBalanceOf(me);
//     const totalLocked = info[0];
//     const nextUnlock = info[1];
//     if (totalLocked.eq(0)) { alert("Nothing to claim yet."); return; }
//     const arxAmount = Number(ethers.utils.formatUnits(totalLocked, TOKEN_DECIMALS));

//     const nowSec = Math.floor(Date.now()/1000);
//     if (nowSec < nextUnlock.toNumber()) {
//       const secs = nextUnlock.toNumber() - nowSec;
//       const hrs = Math.ceil(secs/3600);
//       alert("you have "+ arxAmount +" ARX will be Claimed\n" + "Still locked for ~" + hrs + " hours.");

//       //return;
//     }
//     const tx = await presaleContract.claim();
//     alert("Claim tx: " + tx.hash);
//     await tx.wait();
//     alert("Claimed!");
//   } catch (err) {
//     console.error(err);
//     alert("Claim failed: " + (err?.message || err));
//   }
// }

async function addTokenToWallet() {
  try {
    await ensureBSC();
    await ethereum.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: TOKEN,
          symbol: 'ARX',
          decimals: 18,
          image: window.location.origin + '/assets/img/arabex-logo.png'
        }
      }
    });
  } catch (err) {
    console.error(err);
    alert("Could not add token: " + (err?.message || err));
  }
}

function fmt(n){ return n.toString().padStart(2,"0"); }
function updateCountdown() {
  const now = Date.now();
  const el = document.getElementById("countdown");
  // const btn = document.getElementById("buyBtn");
  const btnBNB = document.getElementById("buyBNBBtn");
  const headline = document.getElementById("headline");

  if (now < PRESALE_START) {
    const diff = PRESALE_START - now;
    const d = Math.floor(diff / (1000*60*60*24));
    const h = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
    const m = Math.floor((diff % (1000*60*60)) / (1000*60));
    const s = Math.floor((diff % (1000*60)) / 1000);
    el.textContent = `Presale starts in ${d}d ${fmt(h)}h:${fmt(m)}m:${fmt(s)}s (UTC)`;
    // btn.disabled = true;
    // btn.textContent = "Presale starts soon";
    btnBNB.disabled = true;
    btnBNB.textContent = "Presale starts soon";
  } else {
    el.textContent = "🔴 Presale is LIVE";
    headline.textContent = "🔥 ARX Presale is LIVE";
    // btn.disabled = false;
    // btn.textContent = "Buy ARX by USDT (Presale)";
    btnBNB.disabled = false;
    btnBNB.textContent = "Buy ARX by BNB (Presale)";
  }
}

updateCountdown();
setInterval(updateCountdown, 1000);

if (window.ethereum) {
  ethereum.on('chainChanged', () => window.location.reload());
  ethereum.on('accountsChanged', () => window.location.reload());
}

function openInMetaMaskMobile() {
  const full = window.location.href;
  window.location.href = `metamask://dapp/${full}`;
  setTimeout(() => {
    window.location.href = `https://metamask.app.link/dapp/${full}`;
  }, 800);
}


function openWalletChooser(){
    debugger;
  const m = document.getElementById('walletModal');
  if (m) m.style.display = 'flex';
}

function closeWalletChooser() {
  const m = document.getElementById('walletModal');
  if (m) m.style.display = 'none';
}


// Trust Wallet deep link
function openInTrustWallet() {
  const full = encodeURIComponent(window.location.href);
  // Universal link for Trust Wallet's dApp browser
  window.location.href = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${full}`;
  // Older scheme fallback
  setTimeout(() => {
    window.location.href = `trust://open_url?url=${full}`;
  }, 800);
}