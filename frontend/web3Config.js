import { ethers, Contract } from "ethers";
// import { Contract } from "ethers";

/* ABI files (/src/abi/*.json) */
import REGISTRY_ABI from "./abi/FfTRegistry.json";
import STAKING_ABI from "./abi/FfTStaking.json";
import GCD_ABI from "./abi/GeoChainData.json";
import GQ_ABI from "./abi/GeoQuadrants.json";


// Debug env visibility (optional)
// console.log(process.env.REACT_APP_API_BASE);


/**
* ============================================================
*  Network + Deployed Addresses (Polygon Amoy)
* ============================================================
*/
// const AMOY_CHAIN_ID = 80002n;
const AMOY_CHAIN_ID = ethers.toBigInt(
  String(process.env.REACT_APP_CHAIN_ID || "80002").trim()
);


// Registry is the source of truth
// const REGISTRY_ADDRESS_FALLBACK =process.env.REACT_APP_REGISTRY_ADDRESS ||  "0x4F3eB03699Aff58F02D8F6DAdfD0AcFE78A02d09";
const REGISTRY_ADDRESS_FALLBACK = process.env.REACT_APP_REGISTRY_ADDRESS || "0x58baE811a67E312BBB7B7fF1A438a2A0137155cd";  // ✅ new

// Fallbacks (if Registry isn't set or read fail)
// const GCD_ADDRESS_FALLBACK = "0x1546EB8848F93c8eB0Dc601d609bd606646aC8c9";
const GCD_ADDRESS_FALLBACK = process.env.REACT_APP_GCD_ADDRESS || "0x3131AcA746B7613390DED61613E5C0Ae9944B635"; // ✅ new
// const QUADRANTS_ADDRESS_FALLBACK = "0x4542FBcD0b384F843d989732448295bCDa116422";
const QUADRANTS_ADDRESS_FALLBACK = process.env.REACT_APP_QUADRANTS_ADDRESS || "0x1421C0dd6D962fb5c5A29340C74bEE66AdA60BFb";  // ✅ new
// const STAKING_ADDRESS_FALLBACK = "0x4f78E364ccfC9C95be56Fee37a68520F685294B3";
const STAKING_ADDRESS_FALLBACK = process.env.REACT_APP_STAKING_ADDRESS || "0x49568b041FD6F77dAD1611978043Ba2b18D84b92";  // ✅ new

/**
* ============================================================
*  Config
* ============================================================
*/

// const API_BASE = process.env.REACT_APP_API_BASE || "http://10.198.3.166:8000"; // for backend proxy (for example IPFS pin)

const API_BASE_RAW = (process.env.REACT_APP_API_BASE || "").trim();
const API_BASE =
  API_BASE_RAW ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "/api");


// const IPFS_GATEWAY =
//  process.env.REACT_APP_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

// If env is not set, fall back to backend proxy on the same origin
const IPFS_GATEWAY_RAW =
  process.env.REACT_APP_IPFS_GATEWAY || `${API_BASE}/ipfs/cid/`;

// Ensure it ends with "/"
const IPFS_GATEWAY = IPFS_GATEWAY_RAW.endsWith("/")
  ? IPFS_GATEWAY_RAW
  : IPFS_GATEWAY_RAW + "/";


const ZERO = ethers.ZeroAddress;

const RPC_URL = process.env.REACT_APP_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";


let _rpcProvider = null;
let _rpcProviderTime = 0;

// ✅ Health check every 2 minutes
const RPC_HEALTH_CHECK_MS = 2 * 60 * 1000;

// ✅ Sync version kept for places where async is not possible
export function getRpcProvider() {
  if (!_rpcProvider) {
    _rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
    _rpcProviderTime = Date.now();
  }
  return _rpcProvider;
}

// ✅ Async version with health check — used by getReadProvider()
async function getHealthyRpcProvider() {
  const now = Date.now();

  // If provider exists and health check has not expired — return it
  if (_rpcProvider && (now - _rpcProviderTime) < RPC_HEALTH_CHECK_MS) {
    return _rpcProvider;
  }


  // ✅ No provider or TTL expired — verify connection
  if (!_rpcProvider) {
    _rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
    _rpcProviderTime = now;
  }

  try {
    // ✅ Lightweight ping — getBlockNumber is the cheapest RPC call
    await _rpcProvider.getBlockNumber();
    _rpcProviderTime = now; // ✅ connection OK — reset timer
    return _rpcProvider;
  } catch (err) {
    console.warn(
      "[web3Config] RPC provider health check failed, resetting:",
      err.message
    );

    // ✅ Provider is dead — create a new one
    _rpcProvider = null;
    _rpcProviderTime = 0;

    try {
      _rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
      _rpcProviderTime = Date.now();

      // ✅ Verify the new provider works
      await _rpcProvider.getBlockNumber();
      console.log("[web3Config] RPC provider reconnected successfully.");
      return _rpcProvider;
    } catch (reconnectErr) {
      console.error(
        "[web3Config] RPC reconnect also failed:",
        reconnectErr.message
      );
      // ✅ Return provider despite error — caller will get
      // a normal error on the next call
      return _rpcProvider;
    }
  }
}

// ✅ Manual reset — useful for development and error recovery
export function resetRpcProvider() {
  console.warn("[web3Config] RPC provider manually reset.");
  _rpcProvider = null;
  _rpcProviderTime = 0;
}



// ... and let getReadProvider() use RPC:
async function getReadProvider() {
  // ✅ Use health-checked version instead of sync getRpcProvider()
  return getHealthyRpcProvider();
}

/**
* ============================================================
*  Provider / Signer Helpers
* ============================================================
*/
function requireEthereum() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask (window.ethereum) is not available.");
  }
}

function getBrowserProvider() {
  requireEthereum();
  return new ethers.BrowserProvider(window.ethereum);
}

// Read-only RPC provider (not need MetaMask)
// export function getRpcProvider() {
//  return new ethers.JsonRpcProvider(RPC_URL);
// }

async function ensureAmoy(provider) {
  const net = await provider.getNetwork();
  if (net.chainId !== AMOY_CHAIN_ID) {
    throw new Error(
     `Wrong network. Expected Polygon Amoy (chainId=${AMOY_CHAIN_ID}), got chainId=${net.chainId}.`
    );
  }
  return net;
}

async function getSigner() {
  const provider = getBrowserProvider();
  await ensureAmoy(provider);
  return provider.getSigner();
}


/**
* ============================================================
*  Wallet connect
* ============================================================
*/
export const connectWallet = async () => {
  // ✅ Throw error instead of alert() — caller handles the message
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "MetaMask is not installed. Please install it from metamask.io."
    );
  }

  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const provider = getBrowserProvider();
    const net = await provider.getNetwork();

    if (net.chainId !== AMOY_CHAIN_ID) {
      // ✅ Throw error instead of alert() — WalletContext catches this in the catch block
      throw new Error(
        `Wrong network. Please switch MetaMask to Polygon Amoy testnet (chainId=80002). You are on chainId=${net.chainId}.`
      );
    }

    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    return { provider, signer, address };
  } catch (error) {
    // ✅ Re-throw — do not swallow the error, WalletContext catches it
    throw error;
  }
};

/**
* ============================================================
*  IPFS helpers
* ============================================================
*/
export function ipfsToHttp(hashOrUri) {
  if (!hashOrUri) return null;

  let h = String(hashOrUri).trim();

  // Already a full HTTP(S) URL — return as-is
  if (h.startsWith("http://") || h.startsWith("https://")) {
    return h;
  }

  // Handle ipfs://CID or ipfs://CID/path
  if (h.startsWith("ipfs://")) {
    h = h.slice("ipfs://".length);
  }

  // Handle legacy ipfs:/CID (single slash)
  if (h.startsWith("ipfs:/")) {
    h = h.slice("ipfs:/".length);
  }

  // Strip leading slash if present
  if (h.startsWith("/")) {
    h = h.slice(1);
  }

  // Treat remainder as a bare CID
  return IPFS_GATEWAY + h;
}

export const fetchMetadataFromIPFS = async (ipfsHashOrUri) => {
  try {
    const url = ipfsToHttp(ipfsHashOrUri);
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`IPFS HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error("❌ fetchMetadataFromIPFS error:", err);
    return null;
  }
};

/**
* ============================================================
*  Registry-driven address resolution
* ============================================================
*/
let _addrCache = null; // cached addresses: { registry, gcd, quadrants, staking, treasury }
let _addrCacheTime = 0; // ✅ timestamp of last cache fill

// ✅ Export function for manual cache invalidation
// Cache TTL: 5 minutes (300 seconds)
// Can be increased to 30 min or more in production
const ADDR_CACHE_TTL_MS = 5 * 60 * 1000;

export function clearAddressCache() {
  console.warn("[web3Config] Address cache cleared.");
  _addrCache = null;
  _addrCacheTime = 0;
}


export async function getResolvedAddresses() {
  const now = Date.now();

  // ✅ Cache is valid only if it exists AND has not expired
  if (_addrCache && (now - _addrCacheTime) < ADDR_CACHE_TTL_MS) {
    return _addrCache;
  }

  // Cache expired or empty — re-read from chain
  _addrCache = await readRegistryAddresses();
  _addrCacheTime = now; // ✅ record when cache was filled
  return _addrCache;
}

// ✅ Helper that wraps every contract call with retry logic
async function withAddressRetry(fn) {
  try {
    // Try normally first
    return await fn();
  } catch (err) {
    const msg = err?.message || "";

    // ✅ Detect errors that suggest a wrong contract address
    const isAddressError =
      msg.includes("call revert exception") ||
      msg.includes("could not decode result data") ||
      msg.includes("invalid address") ||
      msg.includes("network does not support ENS") ||
      msg.includes("contract not deployed") ||
      err?.code === "CALL_EXCEPTION";

    if (isAddressError && _addrCache) {
      console.warn(
        "[web3Config] Contract call failed — clearing address cache and retrying...",
        err.message
      );

      // ✅ Invalidate cache
      clearAddressCache();

      try {
        // ✅ Retry with fresh addresses
        return await fn();
      } catch (retryErr) {
        // Retry also failed — throw original error
        console.error("[web3Config] Retry also failed:", retryErr.message);
        throw retryErr;
      }
    }

    // Not an address error — rethrow normally
    throw err;
  }
}


async function readRegistryAddresses() {
  const provider = await getReadProvider();
  const registryAddr = REGISTRY_ADDRESS_FALLBACK;

  const registry = new Contract(registryAddr, REGISTRY_ABI, provider);

  try {
    const [gcd, quadrants, staking, treasury] =
      await registry.getAllAddresses();


    const resolved = {
      registry: registryAddr,
      gcd: gcd && gcd !== ZERO ? gcd : GCD_ADDRESS_FALLBACK,
      quadrants: quadrants && quadrants !== ZERO ? quadrants : QUADRANTS_ADDRESS_FALLBACK,
      staking: staking && staking !== ZERO ? staking : STAKING_ADDRESS_FALLBACK,
      treasury: treasury && treasury !== ZERO ? treasury : null,
    };

    // Log mismatch: warn if Registry addresses are unset or mismatched
    if (!gcd || gcd === ZERO) console.warn("⚠️ Registry.gcdToken() is not set, using fallback address.");
    if (!quadrants || quadrants === ZERO) console.warn("⚠️ Registry.quadrantsNft() is not set, using fallback address.");
    if (!staking || staking === ZERO) console.warn("⚠️ Registry.staking() is not set, using fallback address.");

    return resolved;
  } catch (e) {
    console.warn("⚠️ Could not read Registry addresses, using fallback addresses.", e);
    return {
      registry: registryAddr,
      gcd: GCD_ADDRESS_FALLBACK,
      quadrants: QUADRANTS_ADDRESS_FALLBACK,
      staking: STAKING_ADDRESS_FALLBACK,
      treasury: null,
    };
  }
}


export async function getRegistryContract({ withSigner = false } = {}) {
  const p = withSigner ? await getSigner() : await getReadProvider();
  return new Contract(REGISTRY_ADDRESS_FALLBACK, REGISTRY_ABI, p);
}

export async function getGcdContract({ withSigner = false } = {}) {
  return withAddressRetry(async () => {
    const { gcd } = await getResolvedAddresses();
    const p = withSigner ? await getSigner() : await getReadProvider();
    return new Contract(gcd, GCD_ABI, p);
  });
}

export async function getQuadrantsContract({ withSigner = false } = {}) {
  return withAddressRetry(async () => {
    const { quadrants } = await getResolvedAddresses();
    const p = withSigner ? await getSigner() : await getReadProvider();
    return new Contract(quadrants, GQ_ABI, p);
  });
}

export async function getStakingContract({ withSigner = false } = {}) {
  return withAddressRetry(async () => {
    const { staking } = await getResolvedAddresses();
    const p = withSigner ? await getSigner() : await getReadProvider();
    return new Contract(staking, STAKING_ABI, p);
  });
}

/**
* ============================================================
*  Quadrants helpers (new contract model)
* ============================================================
*/

// Bit packing helper: tokenId = (resolution << 64) | cellId
export function computeTokenId(resolution, cellId) {
  // JS BigInt math
  const res = ethers.toBigInt(resolution);
  const cid = ethers.toBigInt(cellId);
  return (res << 64n) | cid;
}

// Optional: L0 helper (only for  minting 10° raster in beti)
// NOTE: Practical scheme. It has to be the same scheme as used in L0 minting.
export function l0CellIdFromLatLon10deg(lat, lon) {
  // lat: -80..80 step10 (17 values)
  // lon: -180..180 step10 (37 values) or -180..170 (36) — your decision.
  // Currently support for  -180..180 scheme. 
  const latN = Number(lat);
  const lonN = Number(lon);

  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
    throw new Error("lat/lon must be numbers");
  }
  if (latN < -90 || latN > 90 || lonN < -180 || lonN > 180) {
    throw new Error("lat/lon out of scope");
  }
  if (latN % 10 !== 0 || lonN % 10 !== 0) {
    throw new Error("lat/lon has ti be on 10° raster");
  }

  const latIdx = Math.round((latN + 80) / 10); // 0..16 if -80..80
  const lonIdx = Math.round((lonN + 180) / 10); // 0..36 if -180..180

  if (latIdx < 0 || latIdx > 16) {
    throw new Error("L0 lat must be in [-80..80] at 10° steps");
  }
  if (lonIdx < 0 || lonIdx > 36) {
    throw new Error("L0 lon must be in [-180..180] at 10° steps");
  }

  // simple package for uint64: latIdx * 1000 + lonIdx 
  return ethers.toBigInt(latIdx) * 1000n + ethers.toBigInt(lonIdx);
}

export const checkOwnership = async (tokenId, userAddress) => {
  try {
    const contract = await getQuadrantsContract(); // read ok
    const owner = await contract.ownerOf(tokenId);
    return owner.toLowerCase() === userAddress.toLowerCase();
  } catch (err) {
    console.error("❌ checkOwnership error:", err);
    return false;
  }
};



// Read quadrant data (works with new contract: quadrants(tokenId))
// ✅ Does not require MetaMask connection; works in read-only mode too.
export const getQuadrantData = async (tokenId, opts = {}) => {
  if (tokenId === undefined || tokenId === null) {
    console.error("❌ tokenId is not defined!");
    return null;
  }

  const requireOwnerForMetadata = !!opts.requireOwnerForMetadata;

  try {
    // 1) Read-only provider
    const rpc = getRpcProvider();

    // ✅ Use getResolvedAddresses() which has cache + TTL + retry
    // No extra RPC calls if cache is valid
    let quadrantsAddr;
    try {
      const { quadrants } = await getResolvedAddresses();
      quadrantsAddr = quadrants;
    } catch (e) {
      // ✅ Fallback if Registry is unavailable
      console.warn(
        "[getQuadrantData] getResolvedAddresses failed, using fallback:",
        e.message
      );
      quadrantsAddr = QUADRANTS_ADDRESS_FALLBACK;
    }

    const contract = new Contract(quadrantsAddr, GQ_ABI, rpc);
    // ... rest of the function continues


    const tid = ethers.toBigInt(tokenId);

    // 3) Struct iz public mapping-a: quadrants(tokenId)
    const q = await contract.quadrants(tid);

    const latRaw = q.lat ?? q[0];
    const lonRaw = q.lon ?? q[1];
    const resRaw = q.resolution ?? q[2];
    const cellRaw = q.cellId ?? q[3];
    const metaRaw = q.metadataHash ?? q[4];

    let latitude = Number(latRaw);
    let longitude = Number(lonRaw);
    const resolution = Number(resRaw);
    const cellId = cellRaw != null ? ethers.toBigInt(cellRaw) : null;

    let metadataUri = (metaRaw ? String(metaRaw) : "").split("\u0000").join("").trim();

    // 4) Fallback: if metadataUri looks invalid -> try ERC721 tokenURI()
    if (!metadataUri || metadataUri === "undefined" || metadataUri === "ipfs://undefined") {
      try {
        const uri = await contract.tokenURI(tid);
        metadataUri = uri ? String(uri).trim() : "";
      } catch (e) {
        // ignore
      }
    }

    // 5) Normalisation: if only a bare CID (bafk...) -> prefix with ipfs://
    // Fixes UI reading when CID was stored without ipfs:// prefix
    if (metadataUri && !metadataUri.startsWith("ipfs://") && !metadataUri.startsWith("http://") && !metadataUri.startsWith("https://")) {
      metadataUri = `ipfs://${metadataUri}`;
    }

    // Final sanitisation
    if (metadataUri === "undefined" || metadataUri === "ipfs://undefined") {
      metadataUri = "";
    }

    // 6) Poles — support for both legacy and new contract models
    let isNorthPole = false;
    let isSouthPole = false;

    // legacy: lon==9999
    if (longitude === 9999) {
      longitude = 0;
      if (latitude > 0) {
        latitude = 90;
        isNorthPole = true;
      } else {
        latitude = -90;
        isSouthPole = true;
      }
    }

    // new special: resolution 255 + cellId 1/2 (if schema is using)
    if (resolution === 255 && cellId !== null) {
      if (cellId === 1n) {
        isNorthPole = true;
        latitude = 90;
        longitude = 0;
      } else if (cellId === 2n) {
        isSouthPole = true;
        latitude = -90;
        longitude = 0;
      }
    }

    // 7) Owner + (optional) gating for metadata
    const owner = await contract.ownerOf(tid);

    let isOwner = false;
    if (requireOwnerForMetadata && typeof window !== "undefined" && window.ethereum) {
      // without pop-up: eth_accounts return [] if not connected
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const userAddress = Array.isArray(accounts) && accounts.length ? accounts[0] : null;
      if (userAddress) isOwner = owner.toLowerCase() === userAddress.toLowerCase();
    }

    // 8) Metadata fetch (default: fetch for all; if requireOwnerForMetadata=true -> only for owner)
    let metadata = null;
    if (metadataUri && (!requireOwnerForMetadata || isOwner)) {
      metadata = await fetchMetadataFromIPFS(metadataUri);
    }

    return {
      tokenId: tid.toString(),
      lat: latitude,
      lon: longitude,
      owner,
      metadataHash: metadataUri || null, // kept for MetaMask compatibility
      metadata,
      resolution,
      cellId: cellId !== null ? cellId.toString() : null,
      isNorthPole,
      isSouthPole,
    };
  } catch (error) {
    console.error(`❌ getQuadrantData(${tokenId}) error:`, error);
    return null;
  }
};




// Update metadata (calls updateMetadata on GeoQuadrants)
export const updateQuadrantMetadata = async (tokenId, newHash) => {
  try {
    const contract = await getQuadrantsContract({ withSigner: true });
    const tx = await contract.updateMetadata(tokenId, newHash);
    await tx.wait();
    console.log("✅ Metadata updated:", tx.hash);
    return tx;
  } catch (err) {
    console.error("❌ updateQuadrantMetadata error:", err);
    return null;
  }
};

// Backward-compatible name: authorizeEditor(tokenId, editorAddress)
// New contract uses: setEditor(tokenId, editor, allowed)
export const authorizeEditor = async (tokenId, editorAddress) => {
  try {
    const contract = await getQuadrantsContract({ withSigner: true });

    // Prefer new function if exists
    if (typeof contract.setEditor === "function") {
      const tx = await contract.setEditor(tokenId, editorAddress, true);
      await tx.wait();
      console.log("✅ Editor enabled via setEditor:", editorAddress);
      return true;
    }

    // Legacy fallback (if authorizeEditor is still in ABI)
    if (typeof contract.authorizeEditor === "function") {
      const tx = await contract.authorizeEditor(tokenId, editorAddress);
      await tx.wait();
      console.log("✅ Editor enabled via authorizeEditor:", editorAddress);
      return true;
    }

    throw new Error("Neither setEditor nor authorizeEditor exist in ABI.");
  } catch (err) {
    console.error("❌ authorizeEditor error:", err);
    return false;
  }
};

// Admin mint helper (new signature)
// mintQuadrant(to, lat, lon, resolution, cellId, metadataHash)
export const mintQuadrant = async ({
  to,
  lat,
  lon,
  resolution,
  cellId,
  metadataHash,
}) => {
  try {
    const signer = await getSigner();
    const adminAddr = await signer.getAddress();
    const recipient = to || adminAddr;

    const contract = await getQuadrantsContract({ withSigner: true });

    if (typeof contract.mintQuadrant !== "function") {
      throw new Error("mintQuadrant function does not exist in ABI.");
    }

    const tx = await contract.mintQuadrant(
      recipient,
      lat,
      lon,
      resolution,
      cellId,
      metadataHash
    );
    await tx.wait();
    console.log("✅ mintQuadrant OK:", tx.hash);
    return tx;
  } catch (err) {
    console.error("❌ mintQuadrant error:", err);
    return null;
  }
};

// Convenience: mint L0 (10° raster) as resolution=0 + computed cellId
export const mintQuadrantL0 = async (lat, lon, metadataHash) => {
  try {
    const cellId = l0CellIdFromLatLon10deg(lat, lon);
    return await mintQuadrant({
      lat,
      lon,
      resolution: 0,
      cellId,
      metadataHash,
    });
  } catch (err) {
    console.error("❌ mintQuadrantL0 error:", err);
    return null;
  }
};

// Debug helper from before
export async function debugCheckQuadrantOnChain(tokenId) {
  try {
    const contract = await getQuadrantsContract();
    const q = await contract.quadrants(tokenId);
    console.log("🔍 RAW quadrants(tokenId):", q);
  } catch (e) {
    console.error("❌ debugCheckQuadrantOnChain error:", e);
  }
}

/**
* ============================================================
*  GCD token helpers
* ============================================================
*/
export const getGcdBalance = async (address) => {
  try {
    const contract = await getGcdContract(); // read provider
    const decimals = await contract.decimals();
    const balance = await contract.balanceOf(address);
    return ethers.formatUnits(balance, decimals);
  } catch (err) {
    console.error("❌Error reading GCD balance:", err);
    return null;
  }
};

export const transferGcd = async (to, amountHuman) => {
  try {
    const contract = await getGcdContract({ withSigner: true });
    const decimals = await contract.decimals();
    const amount = ethers.parseUnits(String(amountHuman), decimals);

    const tx = await contract.transfer(to, amount);
    await tx.wait();

    console.log("✅ GCD transfer OK:", tx.hash);
    return tx;
  } catch (err) {
    console.error("❌Error during GCD transer:", err);
    return null;
  }
};

// Owner/minter-only reward/mint helper (depends on your GeoChainData implementation)
export const rewardContributor = async (to, amountHuman) => {
  try {
    const contract = await getGcdContract({ withSigner: true });
    const decimals = await contract.decimals();
    const amount = ethers.parseUnits(String(amountHuman), decimals);

    // Prefer reward() if exists (as in your older contract / our new contract kept alias)
    if (typeof contract.reward === "function") {
      const tx = await contract.reward(to, amount);
      await tx.wait();
      console.log("✅ Reward OK:", tx.hash);
      return tx;
    }

    // Fallback to mint()
    if (typeof contract.mint === "function") {
      const tx = await contract.mint(to, amount);
      await tx.wait();
      console.log("✅ Mint OK:", tx.hash);
      return tx;
    }

    throw new Error("Neither reward() nor mint() exist in ABI.");
  } catch (err) {
    console.error("❌ rewardContributor error:", err);
    return null;
  }
};

/**
* ============================================================
*  Staking helpers (SafeERC20 flow: approve -> stake)
* ============================================================
*/
export const stakeGcd = async (amountHuman) => {
  try {
    const gcd = await getGcdContract({ withSigner: true });
    const staking = await getStakingContract({ withSigner: true });

    const decimals = await gcd.decimals();
    const amt = ethers.parseUnits(String(amountHuman), decimals);

    const stakingAddr = await staking.getAddress();

    // approve
    const tx1 = await gcd.approve(stakingAddr, amt);
    await tx1.wait();

    // stake
    const tx2 = await staking.stake(amt);
    await tx2.wait();

    console.log("✅ stakeGcd OK:", tx2.hash);
    return tx2;
  } catch (err) {
    console.error("❌ stakeGcd error:", err);
    return null;
  }
};

export const unstakeGcd = async (amountHuman) => {
  try {
    const gcd = await getGcdContract(); // for decimals
    const staking = await getStakingContract({ withSigner: true });

    const decimals = await gcd.decimals();
    const amt = ethers.parseUnits(String(amountHuman), decimals);

    const tx = await staking.unstake(amt);
    await tx.wait();

    console.log("✅ unstakeGcd OK:", tx.hash);
    return tx;
  } catch (err) {
    console.error("❌ unstakeGcd error:", err);
    return null;
  }
};

export const getStakeOf = async (wallet) => {
  try {
    const gcd = await getGcdContract();
    const staking = await getStakingContract();
    const decimals = await gcd.decimals();

    // reads mapping staked(address) from contract
    const raw = await staking.staked(wallet);
    return ethers.formatUnits(raw, decimals);
  } catch (err) {
    console.error("❌ getStakeOf error:", err);
    return null;
  }
};

export const getLockPeriodSeconds = async () => {
  try {
    const staking = await getStakingContract();
    const v = await staking.lockPeriod();
    return Number(v);
  } catch (err) {
    console.error("❌ getLockPeriodSeconds error:", err);
    return null;
  }
};

export const getStakingSurplus = async () => {
  try {
    const gcd = await getGcdContract();
    const staking = await getStakingContract();
    const decimals = await gcd.decimals();

    const surplus = await staking.surplusBalance();
    return ethers.formatUnits(surplus, decimals);
  } catch (err) {
    console.error("❌ getStakingSurplus error:", err);
    return null;
  }
};

export const getStakingContractBalance = async () => {
  try {
    const gcd = await getGcdContract();
    const staking = await getStakingContract();
    const decimals = await gcd.decimals();

    const bal = await staking.contractTokenBalance();
    return ethers.formatUnits(bal, decimals);
  } catch (err) {
    console.error("❌ getStakingContractBalance error:", err);
    return null;
  }
};

/**
* ============================================================
*  Anti-spoofing: sign event payload (MUST 1:1 with backend-om)
* ============================================================
*/
export async function signEventPayload(payload, walletAddress) {
  requireEthereum();
  if (!walletAddress) {
    throw new Error("Missing wallet address for signing.");
  }

  // Must match backend build_event_sign_payload exactly (1:1)
  const message =
    "FfT_EVENT_v1|" +
    `event_id=${payload.event_id}|` +
    `quadrant_id=${payload.quadrant_id || ""}|` +
    `lat=${Number(payload.lat).toFixed(6)}|` +
    `lon=${Number(payload.lon).toFixed(6)}|` +
    `ts=${payload.timestamp}|` +
    `wallet=${walletAddress.toLowerCase()}`;

  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [message, walletAddress],
  });

  return { message, signature };
}

/**
* ============================================================
*  Upload metadata to IPFS (SECURE: backend proxy)
* ============================================================
* Function kept but NO LONGER holds Pinata secret in the frontend.
* Delegates to backend endpoint: POST /ipfs/pin_json
* Body: { json: <metadata> }
* Response: { ipfsHash: "..." } or { IpfsHash: "..." }
*/

// const FFT_ADMIN_KEY = (process.env.REACT_APP_FFT_ADMIN_API_KEY || "").trim();

export const uploadMetadataToIPFS = async (metadata, walletAddress) => {
  try {
    // ✅ Step 1: Compute SHA-256 of the JSON string (must match backend)
    const jsonString = JSON.stringify(
      metadata,
      Object.keys(metadata).sort(), // sort_keys=True to match Python json.dumps
      // Note: not 100% identical to Python json.dumps with sort_keys
      // but sufficient for v0 — backend does not strictly verify sha256
      // when FFT_PIN_REQUIRE_SIG=0
    );

    // ✅ Step 2: Unix timestamp
    const ts = Math.floor(Date.now() / 1000);

    // ✅ Step 3: If wallet is present — sign the request
    let signature = null;
    let signedWallet = null;

    if (walletAddress && window.ethereum) {
      try {
        // SHA-256 of JSON string (Web Crypto API)
        const msgBuffer = new TextEncoder().encode(jsonString);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const jsonSha256 = hashArray
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // Same format as backend build_pin_sign_payload:
        // "FfT_PIN_v1|token_id=...|ts=...|sha256=...|wallet=0x..."
        const tokenId = metadata?.quadrant_id || metadata?.token_id || "";
        const message =
          `FfT_PIN_v1|` +
          `token_id=${tokenId}|` +
          `ts=${ts}|` +
          `sha256=${jsonSha256}|` +
          `wallet=${walletAddress.toLowerCase()}`;

        signature = await window.ethereum.request({
          method: "personal_sign",
          params: [message, walletAddress],
        });
        signedWallet = walletAddress;

        console.log("[IPFS] Signed pin request for wallet:", walletAddress);
      } catch (sigErr) {
        // User rejected signing or error — continue unsigned
        console.warn("[IPFS] Signing failed, proceeding unsigned:", sigErr);
      }
    }

    // ✅ Step 4: Assemble request body
    const body = {
      json: metadata,
      name: metadata?.name || "quadrant_meta",
    };

    // Include signature only if present
    if (signature && signedWallet) {
      body.wallet = signedWallet;
      body.ts = ts;
      body.signature = signature;
    }

    // ✅ Step 5: Send request without admin key
    const headers = { "Content-Type": "application/json" };
    // No X-FFT-Admin-Key header needed ✅

    const res = await fetch(`${API_BASE}/ipfs/pin_json`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Backend pin failed: ${res.status} ${t}`);
    }

    const data = await res.json();
    const cid = data.cid || data.ipfsHash || data.IpfsHash;
    if (!cid) throw new Error("Backend did not return cid/ipfsHash.");

    return cid;
  } catch (err) {
    console.error("❌ uploadMetadataToIPFS error:", err);
    return null;
  }
};


/**
* ============================================================
*  Expose some helpers for browser console (optional)
* ============================================================
*/
// if (typeof window !== "undefined") {
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.resetRpcProvider = resetRpcProvider;
  window.clearAddressCache = clearAddressCache;
  window.getResolvedAddresses = getResolvedAddresses;

  window.getGcdBalance = getGcdBalance;
  window.transferGcd = transferGcd;
  window.rewardContributor = rewardContributor;

  window.getQuadrantData = getQuadrantData;
  window.updateQuadrantMetadata = updateQuadrantMetadata;
  window.authorizeEditor = authorizeEditor;

  window.computeTokenId = computeTokenId;
  window.mintQuadrantL0 = mintQuadrantL0;
  window.debugCheckQuadrantOnChain = debugCheckQuadrantOnChain;

  window.stakeGcd = stakeGcd;
  window.unstakeGcd = unstakeGcd;
  window.getStakeOf = getStakeOf;
  window.getStakingSurplus = getStakingSurplus;

  window.getQuadrantsContract = getQuadrantsContract;
  window.getRegistryContract = getRegistryContract;
  window.getGcdContract = getGcdContract;
  window.getStakingContract = getStakingContract;

  window.connectWallet = connectWallet;

  // useful for mint workflow from browser console
  window.uploadMetadataToIPFS = uploadMetadataToIPFS;
  window.fetchMetadataFromIPFS = fetchMetadataFromIPFS;
}

