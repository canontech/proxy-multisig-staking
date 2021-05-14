# proxy-multisig-staking

## Overview

Demo of institutional grade key management for Substrate staking operations; utilizing multisigs, anonymous proxy accounts, and `Staking` + `CancelProxy` proxy filters. Features usage of the [multisig](https://github.com/paritytech/substrate/tree/master/frame/multisig) and [proxy](https://github.com/paritytech/substrate/tree/master/frame/proxy) [Substrate](https://github.com/paritytech/substrate) FRAME pallets.


## Run

In one terminal, start a substrate or polkadot `--dev --tmp` node. (We use `--tmp` because we need to purge the DB between demo runs.) If you compile from scratch it can take up to 30 minutes for the node to start.

```console
git clone https://github.com/paritytech/polkadot.git
cd polkadot
cargo run -- --dev --tmp
```

In another terminal download this repository

```console
git clone https://github.com/emostov/proxy-multisig-staking.git
cd proxy-multisig-staking
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
-`M` executes `batchAll(staking.bond, staking.setKeys, batchAll(staking.bond, staking.setKeys, staking.validate))` on behalf of `A`
  - `multisig.approveAsMulti(proxy.announce(batchAll(staking.bond, staking.setKeys, staking.validate)))`
  - `multisig.asMulti(proxy.announce(batchAll(staking.bond, staking.setKeys, staking.validate)))`
  - Wait for announcement delay
  - `proxy.proxyAnnounced(batchAll(staking.bond, staking.setKeys, staking.validate))`
- `M` is compromised and announces a unwanted `proxy.announce(staking.validate)`, `U`, on behalf of `A`
  - `proxy.announce(staking.validate)`
- `C` cancels `U` on behalf of `A`
  - `multisig.asMultiThreshold1(proxy.rejectAnnouncement(U))`

## TODO

- Design & build announcement watchdog
