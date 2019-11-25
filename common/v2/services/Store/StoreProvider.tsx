import React, { useState, useContext, useMemo, createContext, useEffect } from 'react';
import * as R from 'ramda';

import {
  Account,
  StoreAccount,
  StoreAsset,
  Network,
  TTicker,
  ExtendedAsset,
  ExtendedAccount,
  WalletId,
  Asset,
  ITxReceipt
} from 'v2/types';
import { isArrayEqual, useInterval, convertToFiatFromAsset, fromTxReceiptObj } from 'v2/utils';
import { ProviderHandler, getTxStatus, getTimestampFromBlockNum } from 'v2/services/EthService';

import { getAccountsAssetsBalances, accountUnlockVIPDetected } from './BalanceService';
import { getStoreAccounts, getPendingTransactionsFromAccounts } from './helpers';
import { AssetContext, getTotalByAsset, getAssetByTicker } from './Asset';
import { AccountContext, getDashboardAccounts } from './Account';
import { SettingsContext } from './Settings';
import { NetworkContext } from './Network';

interface State {
  readonly accounts: StoreAccount[];
  readonly networks: Network[];
  readonly isUnlockVIP: boolean;
  readonly currentAccounts: StoreAccount[];
  tokens(selectedAssets?: StoreAsset[]): StoreAsset[];
  assets(selectedAccounts?: StoreAccount[]): StoreAsset[];
  totals(selectedAccounts?: StoreAccount[]): StoreAsset[];
  totalFiat(
    selectedAccounts?: StoreAccount[]
  ): (getAssetRate: (asset: Asset) => number | undefined) => number;
  assetTickers(targetAssets?: StoreAsset[]): TTicker[];
  assetUUIDs(targetAssets?: StoreAsset[]): any[];
  scanTokens(asset?: ExtendedAsset): Promise<void[]>;
  deleteAccountFromCache(account: ExtendedAccount): void;
  getAssetByTicker(symbol: string): Asset | undefined;
  getAccount(a: Account): StoreAccount | undefined;
}
export const StoreContext = createContext({} as State);

// App Store that combines all data values required by the components such
// as accounts, currentAccount, tokens, and fiatValues etc.
export const StoreProvider: React.FC = ({ children }) => {
  const {
    accounts: rawAccounts,
    addNewTransactionToAccount,
    getAccountByAddressAndNetworkName,
    updateAccountAssets,
    deleteAccount
  } = useContext(AccountContext);
  const { assets } = useContext(AssetContext);
  const { settings, updateSettingsAccounts } = useContext(SettingsContext);
  const { networks } = useContext(NetworkContext);

  const [pendingTransactions, setPendingTransactions] = useState([] as ITxReceipt[]);
  // We transform rawAccounts into StoreAccount. Since the operation is exponential to the number of
  // accounts, make sure it is done only when rawAccounts change.
  const accounts = useMemo(() => getStoreAccounts(rawAccounts, assets, networks), [
    rawAccounts,
    assets,
    networks
  ]);
  const currentAccounts = useMemo(
    () => getDashboardAccounts(accounts, settings.dashboardAccounts),
    [rawAccounts, settings.dashboardAccounts]
  );

  const [isUnlockVIP, setIsUnlockVerified] = useState(false);

  const updateAccounts = (toUpdate: StoreAccount[]) => {
    const set = R.unionWith(R.eqBy(R.prop('uuid')), toUpdate, accounts).filter(Boolean);
    // Create and call updateAccountBalance from AccountContext
    console.debug('Update accounts balance here', toUpdate, set);
  };

  // Naive polling to get the Balances of baseAsset and tokens for each account.
  useInterval(
    () => {
      // Pattern to cancel setState call if ever the component is unmounted
      // before the async requests completes.
      // @TODO: extract into seperate hook e.g. react-use
      // https://www.robinwieruch.de/react-hooks-fetch-data
      let isMounted = true;
      getAccountsAssetsBalances(currentAccounts)
        .then((accountsWithBalances: StoreAccount[]) => {
          // Avoid the state change if the balances are identical.
          if (isArrayEqual(currentAccounts, accountsWithBalances.filter(Boolean))) return;
          if (isMounted) {
            updateAccounts(accountsWithBalances);
          }
          return currentAccounts
            .filter(account => account.networkId === 'Ethereum')
            .filter(account => account.wallet !== WalletId.VIEW_ONLY);
        })
        .then(accountUnlockVIPDetected)
        .then(e => {
          if (!isMounted) return;
          setIsUnlockVerified(e);
        });

      return () => {
        isMounted = false;
      };
    },
    60000,
    true,
    [currentAccounts]
  );

  useEffect(() => {
    setPendingTransactions(getPendingTransactionsFromAccounts(currentAccounts));
  }, [currentAccounts]);

  // A change to pending txs is detected
  useEffect(() => {
    // A pending transaction is detected.
    if (pendingTransactions.length <= 0) return;

    let isMounted = true;
    // This interval is used to poll for status of txs.
    const txStatusLookupInterval = setInterval(() => {
      pendingTransactions.forEach((pendingTransactionObject: ITxReceipt) => {
        const network: Network = pendingTransactionObject.network;
        // If network is not found in the pendingTransactionObject, we cannot continue.
        if (!network) return;
        const provider = new ProviderHandler(network);

        provider.getTransactionByHash(pendingTransactionObject.hash).then(transactionReceipt => {
          // Fail out if tx receipt cant be found.
          // This initial check stops us from spamming node for data before there is data to fetch.
          if (!transactionReceipt) return;
          const receipt = fromTxReceiptObj(transactionReceipt)(assets, networks);

          // fromTxReceiptObj will return undefined if a network config could not be found with the transaction's chainId
          if (!receipt) return;

          // Get block tx success/fail and timestamp for block number, then overwrite existing tx in account.
          Promise.all([
            getTxStatus(provider, receipt.hash),
            getTimestampFromBlockNum(receipt.blockNumber, provider)
          ]).then(([txStatus, txTimestamp]) => {
            // txStatus and txTimestamp return undefined on failed lookups.
            if (!isMounted || !txStatus || !txTimestamp) return;
            const senderAccount =
              pendingTransactionObject.senderAccount ||
              getAccountByAddressAndNetworkName(receipt.from, pendingTransactionObject.network.id);

            addNewTransactionToAccount(senderAccount, {
              ...receipt,
              timestamp: txTimestamp,
              stage: txStatus
            });
          });
        });
      });
    }, 5 * 1000); // Period to reset interval on
    return () => {
      isMounted = false;
      clearInterval(txStatusLookupInterval);
    };
  }, [pendingTransactions]);

  const state: State = {
    accounts,
    networks,
    isUnlockVIP,
    currentAccounts,
    assets: (selectedAccounts = state.accounts) =>
      selectedAccounts.flatMap((account: StoreAccount) => account.assets),
    tokens: (selectedAssets = state.assets()) =>
      selectedAssets.filter((asset: StoreAsset) => asset.type !== 'base'),
    totals: (selectedAccounts = state.accounts) =>
      Object.values(getTotalByAsset(state.assets(selectedAccounts))),
    totalFiat: (selectedAccounts = state.accounts) => (
      getAssetRate: (asset: Asset) => number | undefined
    ) =>
      state
        .totals(selectedAccounts)
        .reduce((sum, asset) => (sum += convertToFiatFromAsset(asset, getAssetRate(asset))), 0),

    assetTickers: (targetAssets = state.assets()) => [
      ...new Set(targetAssets.map(a => a.ticker as TTicker))
    ],
    assetUUIDs: (targetAssets = state.assets()) => {
      return [...new Set(targetAssets.map((a: StoreAsset) => a.uuid))];
    },
    scanTokens: async (asset?: ExtendedAsset) =>
      Promise.all(
        accounts
          .map(account => updateAccountAssets(account, asset ? [...assets, asset] : assets))
          .map(p => p.catch(e => console.debug(e)))
      ),
    deleteAccountFromCache: account => {
      deleteAccount(account);
      updateSettingsAccounts(
        settings.dashboardAccounts.filter(dashboardUUID => dashboardUUID !== account.uuid)
      );
    },
    getAssetByTicker: getAssetByTicker(assets),
    getAccount: ({ address, networkId }) =>
      accounts.find(a => a.address === address && a.networkId === networkId)
  };

  return <StoreContext.Provider value={state}>{children}</StoreContext.Provider>;
};
