import { useEffect, useState } from "react";
import { TonConnectButton } from "@tonconnect/ui-react";
import { StonApiClient, AssetTag } from "@ston-fi/api";

type Asset = {
  contractAddress: string;
  meta?: {
    symbol?: string;
  };
};

export default function App() {
  const [tokens, setTokens] = useState<Asset[]>([]);
  const [tokenA, setTokenA] = useState<Asset | null>(null);
  const [tokenB, setTokenB] = useState<Asset | null>(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const client = new StonApiClient();
        const condition = [AssetTag.LiquidityVeryHigh, AssetTag.LiquidityHigh, AssetTag.LiquidityMedium].join(" | ");
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

  const handleTokenAChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = tokens.find((t) => t.contractAddress === e.target.value);
    if (selected) setTokenA(selected);
  };

  const handleTokenBChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = tokens.find((t) => t.contractAddress === e.target.value);
    if (selected) setTokenB(selected);
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
              <label className="block mb-1 text-sm font-medium text-gray-600">Token A</label>
              <select
                className="w-full p-2 border rounded"
                onChange={handleTokenAChange}
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
              <label className="block mb-1 text-sm font-medium text-gray-600">Token B</label>
              <select
                className="w-full p-2 border rounded"
                onChange={handleTokenBChange}
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
                <label className="block mb-1 text-sm font-medium text-gray-600">Amount A</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  placeholder="0.0"
                  value={amountA}
                  onChange={(e) => setAmountA(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="block mb-1 text-sm font-medium text-gray-600">Amount B</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded"
                  placeholder="0.0"
                  value={amountB}
                  onChange={(e) => setAmountB(e.target.value)}
                />
              </div>
            </div>
          </>
        ) : (
          <p>Loading tokens...</p>
        )}
      </div>
    </div>
  );
}