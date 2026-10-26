import { useEffect, useRef, useState } from "react";
import {
  NFT_LISTINGS,
  NFT_OWNED,
  previewNftBuy,
  previewNftListing,
  type CommonProductForm,
  type ProductPreview,
  type DemoNft,
} from "./productDrafts.mjs";
import { fullAmount } from "./domain.mjs";
import { ProductFields, ProductBoundary } from "./ProductCommon";
function Artwork({ item }: { item: DemoNft }) {
  return (
    <svg
      viewBox="0 0 360 220"
      className="nft-art"
      role="img"
      aria-label={`Demo geometric artwork for ${item.title}`}
    >
      <rect x="1" y="1" width="358" height="218" fill="var(--psy-surface)" />
      <g fill="none" stroke="var(--psy-blue)" strokeWidth="1.5">
        {item.art === 0 ? (
          <>
            <rect x="123" y="51" width="114" height="114" />
            <rect
              x="143"
              y="71"
              width="74"
              height="74"
              transform="rotate(45 180 108)"
            />
            <path d="M88 108h184M180 17v184" />
          </>
        ) : item.art === 1 ? (
          <>
            <circle cx="180" cy="110" r="70" />
            <ellipse cx="180" cy="110" rx="34" ry="70" />
            <path d="M110 110h140M124 69h112M124 151h112" />
          </>
        ) : (
          <>
            <path d="m180 35 78 135H102Zm0 44 53 91H127Z" />
            <circle cx="180" cy="126" r="18" />
          </>
        )}
      </g>
      <text x="20" y="200" className="art-caption">
        DEMO ARTWORK / NOT VERIFIED TOKEN METADATA
      </text>
    </svg>
  );
}
export function NftMarketPanel({
  onPreview,
}: {
  onPreview: (p: ProductPreview) => void;
}) {
  const [mode, setMode] = useState<"browse" | "list">("browse"),
    [common, setCommon] = useState<CommonProductForm>({
      userId: "12345",
      feeCap: "5",
      deadlineMinutes: "30",
    }),
    [maxPrice, setMaxPrice] = useState("10"),
    [price, setPrice] = useState("3"),
    [ownedId, setOwnedId] = useState("owned-3"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("low"),
    [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const update = (key: keyof CommonProductForm, value: string) => {
    setError("");
    setCommon({ ...common, [key]: value });
  };
  const listings = NFT_LISTINGS.filter((n) =>
    (n.title + " " + n.collection + " " + n.tokenWords[0])
      .toLowerCase()
      .includes(query.toLowerCase()),
  ).sort((a, b) => {
    const cmp =
      BigInt(a.price) < BigInt(b.price)
        ? -1
        : BigInt(a.price) > BigInt(b.price)
          ? 1
          : 0;
    return sort === "low" ? cmp : -cmp;
  });
  return (
    <>
      <ProductBoundary />
      <div className="route-tabs nft-mode-tabs" aria-label="NFT activity">
        <button
          aria-pressed={mode === "browse"}
          className={mode === "browse" ? "selected" : ""}
          onClick={() => {
            setError("");
            setMode("browse");
          }}
        >
          Browse listings
        </button>
        <button
          aria-pressed={mode === "list"}
          className={mode === "list" ? "selected" : ""}
          onClick={() => {
            setError("");
            setMode("list");
          }}
        >
          Create listing
        </button>
      </div>
      <div className="nft-workspace">
        <section className="swap-panel nft-settings">
          <h2>{mode === "browse" ? "Purchase settings" : "Listing draft"}</h2>
          <p className="section-note">
            QA Studies · local collection fixture. Ownership and escrow are
            unverified.
          </p>
          <ProductFields form={common} onChange={update} />
          {mode === "browse" ? (
            <label className="liquidity-pool">
              Maximum price per NFT · QA-B
              <input
                aria-label="NFT maximum price"
                inputMode="decimal"
                value={maxPrice}
                onChange={(e) => {
                  setError("");
                  setMaxPrice(e.target.value);
                }}
              />
            </label>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  onPreview(previewNftListing({ ...common, ownedId, price }));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label className="liquidity-pool">
                Demo owned NFT
                <select
                  aria-label="Demo owned NFT"
                  value={ownedId}
                  onChange={(e) => {
                    setError("");
                    setOwnedId(e.target.value);
                  }}
                >
                  {NFT_OWNED.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title} · demo owner {n.owner}
                    </option>
                  ))}
                </select>
              </label>
              <label className="liquidity-pool">
                Listing price · QA-B
                <input
                  aria-label="NFT listing price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => {
                    setError("");
                    setPrice(e.target.value);
                  }}
                />
              </label>
              <button className="primary-button">Preview listing</button>
            </form>
          )}
          {error && (
            <p
              id="nft-form-error"
              className="form-error"
              role="alert"
              ref={errorRef}
              tabIndex={-1}
            >
              {error}
            </p>
          )}
          <div className="recovery-note">
            A purchase binds collection, token ID, seller, listing nonce and
            exact price. One listing can have only one on-chain winner; other
            buyers need actual refunds.
          </div>
          <p className="section-note">
            Listing cancellation is a request. Returning escrow requires the
            applicable contract result and NFT delivery claim; saving or
            cancelling a draft does neither.
          </p>
        </section>
        <section className="nft-gallery-section">
          <div className="section-heading">
            <h2>
              {mode === "browse" ? "Example listings" : "Demo owned NFTs"}
            </h2>
            <span className="fixture-tag">Local fixtures</span>
          </div>
          {mode === "browse" && (
            <div className="nft-toolbar">
              <label>
                Search collection or token
                <input
                  aria-label="Search demo NFTs"
                  maxLength={64}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="QA Study or token ID"
                />
              </label>
              <label>
                Sort
                <select
                  aria-label="Sort NFT listings"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="low">Price: low to high</option>
                  <option value="high">Price: high to low</option>
                </select>
              </label>
            </div>
          )}
          <div className="nft-gallery">
            {mode === "browse"
              ? listings.map((item) => (
                  <article className="nft-card" key={item.id}>
                    <Artwork item={item} />
                    <div className="nft-card-body">
                      <span className="small-note">
                        {item.collection} · fixture
                      </span>
                      <h3>{item.title}</h3>
                      <p>
                        Seller {item.seller} · listing nonce {item.listingNonce}
                      </p>
                      <strong>{fullAmount(item.price)} QA-B</strong>
                      <button
                        className="secondary-button"
                        aria-describedby={error ? "nft-form-error" : undefined}
                        aria-label={`Preview purchase of ${item.title}`}
                        onClick={() => {
                          try {
                            setError("");
                            onPreview(
                              previewNftBuy({
                                ...common,
                                listingId: item.id,
                                maxPrice,
                              }),
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Preview purchase
                      </button>
                    </div>
                  </article>
                ))
              : NFT_OWNED.map((item) => (
                  <article className="nft-card" key={item.id}>
                    <Artwork item={item} />
                    <div className="nft-card-body">
                      <span className="small-note">Demo ownership only</span>
                      <h3>{item.title}</h3>
                      <p>
                        Slot {item.slot} · fixture owner {item.owner}
                      </p>
                      <p className="small-note">
                        A saved draft is not published to the listings above.
                      </p>
                    </div>
                  </article>
                ))}
          </div>
          {mode === "browse" && !listings.length && (
            <div className="empty-state">
              <p>No fixture NFTs match this search.</p>
              <button className="text-button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
