# proxy-multisig-staking

WIP

## Run

Start a substrate or polkadot `--dev --tmp` node. (Use temp because we need to purge the DB between demo runs.)

```console
TODO
```

Install dependencies

```console
yarn install
```

Run the demo

```console
yarn start
```

## Demo workflow

- Eve create anonymous proxy, `A`, with herself as an `Any` proxy.
  - `proxy.anonymous()`
- Eve adds 2/3 multisig, `M`, as time delayed `Staking` proxy to `A`.
  - `proxy.proxy(proxy.addProxy)`
- Eve adds 1/3 multsig `C`, as a `CancelProxy`
  - `proxy.proxy(proxy.addProxy)`
-`M` executes `staking.bond` on behalf of `A`
  - `multisig.approveAsMulti(proxy.announce(staking.bond))`
  - `multisig.asMulti(proxy.announce(staking.bond))` (current stops here)
  - Wait for announcement delay
  - `multisig.approveAsMulti(proxy.proxyAnnounced(staking.bond))`
  - `multisig.asMulti(proxy.proxyAnnounced(staking.bond))`
- `M` executes `session.setKeys` on behalf of `A`
  - ...
- `M` executes `staking.validate` on behalf of `A`
  - ...

## TODO

- Design & build announcement watchdog
