import { useEffect, useState } from "react";
import { TonConnectButton, useTonAddress } from "@tonconnect/ui-react";
import { StonApiClient, AssetTag, type LiquidityProvisionSimulation, type AssetInfoV2 } from "@ston-fi/api";
import { FetchError } from "ofetch";

export default function App() {
  const walletAddress = useTonAddress();

  const [tokens, setTokens] = useState<AssetInfoV2[]>([]);
  const [tokenA, setTokenA] = useState<AssetInfoV2 | null>(null);
  const [tokenB, setTokenB] = useState<AssetInfoV2 | null>(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [simResult, setSimResult] = useState<LiquidityProvisionSimulation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simError, setSimError] = useState("");

  // Pure helper to get decimals with default fallback
  const getDecimals = (asset: AssetInfoV2 | null) =>
    asset?.meta?.decimals ?? 9;

  // Pure helper to get conversion factor
  const getConversionFactor = (asset: AssetInfoV2 | null) =>
    10 ** getDecimals(asset);

  // Convert to base units
  const toBaseUnits = (asset: AssetInfoV2 | null, amt: string) => {
    if (!asset || !amt) return "0";
    return Math.floor(parseFloat(amt) * getConversionFactor(asset)).toString();
  };

  // Convert from base units
  const fromBaseUnits = (asset: AssetInfoV2 | null, baseUnits: string) => {
    if (!asset || !baseUnits) return "0";
    return (parseInt(baseUnits) / getConversionFactor(asset)).toFixed(2);
  };

  // Convert from LP units (always 9 decimals)
  const fromLpUnits = (baseUnits: string) => {
    if (!baseUnits) return "0";
    return (parseInt(baseUnits) / 10 ** 9).toFixed(2);
  };

  // Handle token change in a compositional manner
  const handleTokenChange =
    (setter: React.Dispatch<React.SetStateAction<AssetInfoV2 | null>>) =>
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selected = tokens.find((t) => t.contractAddress === e.target.value);
        if (selected) {
          setter(selected);
        }
      };

  // Extract first pool (pure function)
  const extractFirstPool = (message: string): string | null => {
    const poolMatch = message.match(/\[(.*?)\]/);
    if (!poolMatch?.[1]) return null;
    const pools = poolMatch[1].split(",").map((r) => r.trim());
    return pools[0] ?? null;
  };

  // Check if message indicates existing pool (pure function)
  const isPoolExistsMessage = (message: string): boolean =>
    typeof message === "string" &&
    message.includes("1020: pool") &&
    message.includes("already exists for selected type of router: [");

  // Fetch tokens on mount
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const client = new StonApiClient();
        const condition = [
          AssetTag.LiquidityVeryHigh,
          AssetTag.LiquidityHigh,
          AssetTag.LiquidityMedium
        ].join(" | ");
        const assets = await client.queryAssets({ condition });
        setTokens(assets);

        if (assets.length > 0) setTokenA(assets[0]);
        if (assets.length > 1) setTokenB(assets[1]);
      } catch (err) {
        console.error("Failed to fetch tokens:", err);
      }
    };
    fetchTokens();
  }, []);

  // Main simulation function
  const simulateLiquidity = async () => {

    // Early return if any required field is missing
    if (!tokenA || !tokenB || !amountA || !amountB) {
      alert("Please select tokens and enter amounts for both sides.");
      return;
    }

    setIsSimulating(true);
    setSimError("");
    setSimResult(null);

    const stonClient = new StonApiClient();

    // Helper for making a liquidity provision simulation call
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
      // First try "Initial" provision
      const initialResult = await trySimulate("Initial");
      setSimResult(initialResult);
    } catch (err: unknown) {
      if (err instanceof FetchError) {
        // Check for existing pool
        if (isPoolExistsMessage(err.data)) {
          const firstPool = extractFirstPool(err.data);

          if (!firstPool) {
            setSimError("Failed to extract pool information from error message");
            setIsSimulating(false);
            return;
          }

          // Attempt "Balanced" provision
          try {
            const balancedResult = await trySimulate("Balanced", firstPool);
            setSimResult(balancedResult);
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
      setIsSimulating(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-indigo-700">STON.fi Liquidity</h1>
          <TonConnectButton />
        </div>
        <hr className="border-gray-200" />

        {tokens.length > 0 ? (
          <>
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

            <button
              onClick={simulateLiquidity}
              disabled={!tokenA || !tokenB || !amountA || !amountB || isSimulating}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 rounded"
            >
              {isSimulating ? "Simulating..." : "Simulate"}
            </button>

            {simError && <p className="text-red-600 text-sm">Error: {simError}</p>}

            {simResult && (
              <div className="p-4 bg-gray-50 rounded border border-gray-200 text-sm">
                <p className="font-semibold text-gray-800">Simulation Result</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Provision Type: {simResult.provisionType}</li>
                  <li>Pool Address: {simResult.poolAddress}</li>
                  <li>Router Address: {simResult.routerAddress}</li>
                  <li>Token A: {simResult.tokenA}</li>
                  <li>Token B: {simResult.tokenB}</li>
                  <li>
                    Token A Units: {fromBaseUnits(tokenA, simResult.tokenAUnits)}
                  </li>
                  <li>
                    Token B Units: {fromBaseUnits(tokenB, simResult.tokenBUnits)}
                  </li>
                  <li>LP Account: {simResult.lpAccountAddress}</li>
                  <li>Estimated LP: {fromLpUnits(simResult.estimatedLpUnits)}</li>
                  <li>Min LP: {fromLpUnits(simResult.minLpUnits)}</li>
                  <li>Price Impact: {simResult.priceImpact}</li>
                </ul>
              </div>
            )}
          </>
        ) : (
          <p>Loading tokens...</p>
        )}
      </div>
    </div>
  );
}