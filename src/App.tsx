import { useEffect, useState } from "react";
import { TonConnectButton, useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { StonApiClient, AssetTag, type LiquidityProvisionSimulation, type AssetInfoV2 } from "@ston-fi/api";
import { FetchError } from "ofetch";
import { TonClient } from "@ton/ton";
import { dexFactory } from "@ston-fi/sdk";

export default function App() {
  const walletAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [tokens, setTokens] = useState<AssetInfoV2[]>([]);
  const [tokenA, setTokenA] = useState<AssetInfoV2 | null>(null);
  const [tokenB, setTokenB] = useState<AssetInfoV2 | null>(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [simResult, setSimResult] = useState<LiquidityProvisionSimulation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simError, setSimError] = useState("");


  // Get the decimal precision for an asset, defaulting to 9 if unspecified
  // This is crucial for accurate token amount calculations
  const getDecimals = (asset: AssetInfoV2 | null) =>
    asset?.meta?.decimals ?? 9;

  // Compute conversion factor (10^decimals) for base unit mathematics
  // Used to convert between human-readable amounts and blockchain units
  const getConversionFactor = (asset: AssetInfoV2 | null) =>
    10 ** getDecimals(asset);

  // Convert floating point string amount into integer base units string
  // Essential for blockchain transactions which use integer arithmetic
  const toBaseUnits = (asset: AssetInfoV2 | null, amt: string) => {
    if (!asset || !amt) return "0";
    return Math.floor(parseFloat(amt) * getConversionFactor(asset)).toString();
  };

  // Convert integer base units back to a fixed 2-decimal string for display
  const fromBaseUnits = (asset: AssetInfoV2 | null, baseUnits: string) => {
    if (!asset || !baseUnits) return "0";
    return (parseInt(baseUnits) / getConversionFactor(asset)).toFixed(2);
  };

  // Convert LP token units (always 9 decimals) to fixed 2-decimal string
  // LP tokens on STON.fi always use 9 decimal places regardless of underlying tokens
  const fromLpUnits = (baseUnits: string) => {
    if (!baseUnits) return "0";
    return (parseInt(baseUnits) / 10 ** 9).toFixed(2);
  };


  // Factory function for creating onChange handlers for token dropdowns
  // Uses composition to create reusable handlers for both token selectors
  const handleTokenChange =
    (setter: React.Dispatch<React.SetStateAction<AssetInfoV2 | null>>) =>
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selected = tokens.find((t) => t.contractAddress === e.target.value);
        if (selected) {
          setter(selected);
        }
      };

  // Extract the first pool address from an error message formatted like '[addr1, addr2]'
  // Used when API returns existing pool information in error responses
  const extractFirstPool = (message: string): string | null => {
    const poolMatch = message.match(/\[(.*?)\]/);
    if (!poolMatch?.[1]) return null;
    const pools = poolMatch[1].split(",").map((r) => r.trim());
    return pools[0] ?? null;
  };

  // Determine if the API error indicates an existing pool scenario
  // Specific to STON.fi API error format for duplicate pool creation attempts
  const isPoolExistsMessage = (message: string): boolean =>
    typeof message === "string" &&
    message.includes("1020: pool") &&
    message.includes("already exists for selected type of router: [");

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const client = new StonApiClient();
        // Query only assets with medium or higher liquidity to ensure tradability
        const condition = [
          AssetTag.LiquidityVeryHigh,
          AssetTag.LiquidityHigh,
          AssetTag.LiquidityMedium
        ].join(" | ");
        const assets = await client.queryAssets({ condition });
        setTokens(assets);

        // Initialize default selections if tokens are available
        if (assets.length > 0) setTokenA(assets[0]);
        if (assets.length > 1) setTokenB(assets[1]);
      } catch (err) {
        console.error("Failed to fetch tokens:", err);
      }
    };
    fetchTokens();
  }, []);

  const simulateLiquidity = async () => {

    // Early return pattern: validate all required inputs before API calls
    if (!tokenA || !tokenB || !amountA || !amountB) {
      alert("Please select tokens and enter amounts for both sides.");
      return;
    }

    // Reset previous simulation state for clean UI feedback
    setIsSimulating(true);
    setSimError("");
    setSimResult(null);

    const stonClient = new StonApiClient();

    // Internal helper: abstracted API call for different provision types
    // Reduces code duplication between Initial and Balanced provision attempts
    const trySimulate = async (
      provisionType: "Initial" | "Balanced",
      poolAddress?: string
    ) => {
      if (provisionType === "Initial") {
        return stonClient.simulateLiquidityProvision({
          provisionType: "Initial",
          tokenA: tokenA.contractAddress,
          tokenB: tokenB.contractAddress,
          tokenAUnits: toBaseUnits(tokenA, amountA),
          tokenBUnits: toBaseUnits(tokenB, amountB),
          slippageTolerance: "0.001",
          walletAddress: walletAddress || "",
        });
      }

      // Balanced provision requires existing pool address
      if (!poolAddress) {
        throw new Error("Pool address is required for Balanced provision");
      }

      return stonClient.simulateLiquidityProvision({
        provisionType: "Balanced",
        tokenA: tokenA.contractAddress,
        tokenB: tokenB.contractAddress,
        tokenAUnits: toBaseUnits(tokenA, amountA),
        poolAddress,
        slippageTolerance: "0.001",
        walletAddress: walletAddress || "",
      });
    };

    try {
      // First attempt: try Initial provision (for new pools)
      const initialResult = await trySimulate("Initial");
      setSimResult(initialResult);
      // Update token B amount based on simulation result
      setAmountB(fromBaseUnits(tokenB, initialResult.tokenBUnits));
    } catch (err: unknown) {
      if (err instanceof FetchError) {
        // Handle existing pool scenario: extract pool address and retry as Balanced
        if (isPoolExistsMessage(err.data)) {
          const firstPool = extractFirstPool(err.data);

          if (!firstPool) {
            setSimError("Failed to extract pool information from error message");
            setIsSimulating(false);
            return;
          }

          // Second attempt: Balanced provision with existing pool
          try {
            const balancedResult = await trySimulate("Balanced", firstPool);
            setSimResult(balancedResult);
            // Update token B amount based on balanced simulation result
            setAmountB(fromBaseUnits(tokenB, balancedResult.tokenBUnits));
          } catch (err2: unknown) {
            setSimError(err2 instanceof Error ? err2.message : String(err2));
          }
        } else {
          setSimError(err.data);
        }
      } else {
        setSimError(String(err));
      }
    } finally {
      // Always end loading state regardless of success/failure
      setIsSimulating(false);
    }
  };

  // Execute liquidity provision transaction using TonConnect
  // Handles both TON and Jetton tokens with appropriate contract methods
  const provideLiquidity = async () => {
    // Early return pattern: validate prerequisites before complex operations
    if (!simResult) {
      alert("Please simulate first.");
      return;
    }
    if (!walletAddress) {
      alert("Please connect your wallet first.");
      return;
    }

    try {
      // Initialize TON JSON-RPC client for blockchain interactions
      const tonApiClient = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC",
        apiKey: import.meta.env.VITE_TON_API_KEY,
      });

      // Retrieve router metadata and create contract instances
      const client = new StonApiClient();
      const routerMetadata = await client.getRouter(simResult.routerAddress);
      const dexContracts = dexFactory(routerMetadata);
      const router = tonApiClient.open(
        dexContracts.Router.create(routerMetadata.address)
      );
      const pTON = dexContracts.pTON.create(routerMetadata.ptonMasterAddress);

      // Base transaction parameters shared between both token transactions
      const baseParams = {
        userWalletAddress: walletAddress,
        minLpOut: simResult.minLpUnits,
      };

      // Configure transaction parameters for each token in the pair
      // This abstraction allows handling different token types (TON vs Jetton) uniformly
      const tokenConfigs = [
        {
          token: tokenA,
          sendAmount: simResult.tokenAUnits,
          sendTokenAddress: simResult.tokenA,
          otherTokenAddress: tokenB?.kind === "Ton" ? pTON.address : simResult.tokenB,
        },
        {
          token: tokenB,
          sendAmount: simResult.tokenBUnits,
          sendTokenAddress: simResult.tokenB,
          otherTokenAddress: tokenA?.kind === "Ton" ? pTON.address : simResult.tokenA,
        }
      ];

      // Generate transaction parameters for both tokens
      // Different methods are used for TON vs Jetton tokens due to blockchain mechanics
      const txParams = await Promise.all(
        tokenConfigs.map(async (config) => {
          const params = {
            ...baseParams,
            sendAmount: config.sendAmount,
            otherTokenAddress: config.otherTokenAddress,
          };

          // TON requires proxy contract, Jettons use direct transfer
          return config.token?.kind === "Ton"
            ? router.getProvideLiquidityTonTxParams({
                ...params,
                proxyTon: pTON,
              })
            : router.getProvideLiquidityJettonTxParams({
                ...params,
                sendTokenAddress: config.sendTokenAddress,
              });
        })
      );

      // Format transaction messages for TonConnect sendTransaction interface
      const messages = txParams.map(txParam => ({
        address: txParam.to.toString(),
        amount: txParam.value.toString(),
        payload: txParam.body?.toBoc().toString("base64"),
      }));

      // Trigger TonConnect modal for user transaction approval
      await tonConnectUI.sendTransaction({
        validUntil: Date.now() + 5 * 60 * 1000, // Transaction valid for 5 minutes
        messages,
      });
      alert("Liquidity provision transaction sent!");
    } catch (err) {
      console.error("Provide liquidity error:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-6 space-y-6">
        {/* Application header with branding and wallet connection */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-indigo-700">STON.fi Liquidity</h1>
          <TonConnectButton />
        </div>
        <hr className="border-gray-200" />

        {/* Main application interface (conditional on token data availability) */}
        {tokens.length > 0 ? (
          <>
            {/* Token A selection dropdown */}
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-600">
                Token A
              </label>
              <select
                className="w-full p-2 border rounded"
                onChange={handleTokenChange(setTokenA)}
                value={tokenA?.contractAddress || ""}
              >
                {tokens.map((tok) => (
                  <option key={tok.contractAddress} value={tok.contractAddress}>
                    {tok.meta?.symbol ?? "Token"}
                  </option>
                ))}
              </select>
            </div>

            {/* Token B selection dropdown */}
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-600">
                Token B
              </label>
              <select
                className="w-full p-2 border rounded"
                onChange={handleTokenChange(setTokenB)}
                value={tokenB?.contractAddress || ""}
              >
                {tokens.map((tok) => (
                  <option key={tok.contractAddress} value={tok.contractAddress}>
                    {tok.meta?.symbol ?? "Token"}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount input fields (side by side layout) */}
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block mb-1 text-sm font-medium text-gray-600">
                  Amount A
                </label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  placeholder="0.0"
                  value={amountA}
                  onChange={(e) => setAmountA(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="block mb-1 text-sm font-medium text-gray-600">
                  Amount B
                </label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  placeholder="0.0"
                  value={amountB}
                  onChange={(e) => setAmountB(e.target.value)}
                />
              </div>
            </div>

            {/* Simulation trigger button with validation */}
            <button
              onClick={simulateLiquidity}
              disabled={!tokenA || !tokenB || !amountA || !amountB || isSimulating}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 rounded"
            >
              {isSimulating ? "Simulating..." : "Simulate"}
            </button>

            {/* Error display for simulation failures */}
            {simError && <p className="text-red-600 text-sm">Error: {simError}</p>}

            {/* Simulation results display and transaction execution */}
            {simResult && (
              <>
                <div className="p-4 bg-gray-50 rounded border border-gray-200 text-sm overflow-x-auto break-all max-w-full">
                  <p className="font-semibold text-gray-800">Simulation Result</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                    {Object.entries({
                      "Provision Type": simResult.provisionType,
                      "Pool Address": simResult.poolAddress,
                      "Router Address": simResult.routerAddress,
                      "Token A": simResult.tokenA,
                      "Token B": simResult.tokenB,
                      "Token A Units": fromBaseUnits(tokenA, simResult.tokenAUnits),
                      "Token B Units": fromBaseUnits(tokenB, simResult.tokenBUnits),
                      "LP Account": simResult.lpAccountAddress,
                      "Estimated LP": fromLpUnits(simResult.estimatedLpUnits),
                      "Min LP": fromLpUnits(simResult.minLpUnits),
                      "Price Impact": simResult.priceImpact,
                    }).map(([label, value]) => (
                      <li key={label}>
                        <span className="font-medium">{label}:</span>{" "}
                        <span className="break-all">{value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Transaction execution button (only shown after successful simulation) */}
                <button
                  onClick={provideLiquidity}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 rounded mt-4"
                >
                  Provide Liquidity
                </button>
              </>
            )}
          </>
        ) : (
          <p>Loading tokens...</p>
        )}
      </div>
    </div>
  );
}