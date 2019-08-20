import React, { useContext, useState } from 'react';
import BN from 'bn.js';
import { Address, Button, Network } from '@mycrypto/ui';

import feeIcon from 'common/assets/images/icn-fee.svg';
import sendIcon from 'common/assets/images/icn-send.svg';
import { AddressBookContext } from 'v2/services/Store';
import { Amount } from 'v2/components';
import {
  fromWei,
  Wei,
  totalTxFeeToString,
  totalTxFeeToWei,
  baseToConvertedUnit
} from 'v2/services/EthService';

import { IStepComponentProps } from '../types';
import './ConfirmTransaction.scss';

const truncate = (children: string) => {
  return [children.substring(0, 6), '…', children.substring(children.length - 4)].join('');
};

/*
  Confirm should only display values! There are no data transformations.
  The currentPath in SendAssets determines which action should be called.
*/

export default function ConfirmTransaction({ txConfig, onComplete }: IStepComponentProps) {
  const { getContactByAccount, getContactByAddressAndNetwork } = useContext(AddressBookContext);
  const [showDetails, setShowDetails] = useState(false);

  const recipientContact = getContactByAddressAndNetwork(
    txConfig.receiverAddress,
    txConfig.network
  );
  const recipientLabel = recipientContact ? recipientContact.label : 'Unknown Address';

  /* ToDo: Figure out how to extract this */
  const {
    asset,
    gasPrice,
    gasLimit,
    value,
    amount,
    senderAccount,
    receiverAddress,
    network,
    nonce,
    data,
    baseAsset
  } = txConfig;
  const assetType = asset.type;

  /* Calculate Transaction Fee */
  const transactionFeeWei: BN = totalTxFeeToWei(gasPrice, gasLimit);
  const maxTransactionFeeBase: string = totalTxFeeToString(gasPrice, gasLimit);

  /* Calculate total base asset amount */
  const valueWei = Wei(value);
  const totalEtherEgress = parseFloat(fromWei(valueWei.add(transactionFeeWei), 'ether')).toFixed(6); // @TODO: BN math, add amount + maxCost !In same symbol
  const networkName = network ? network.name : undefined;

  /* Calculate User's Asset Balance */
  const userAssetToSend = senderAccount.assets.find(
    accountAsset => accountAsset.uuid === asset.uuid
  );
  const userAssetBalance = userAssetToSend ? userAssetToSend.balance : 'Unknown Balance';

  /* Determing User's Contact */
  const senderContact = getContactByAccount(senderAccount);
  const senderAccountLabel = senderContact ? senderContact.label : 'Unknown Account';

  return (
    <div className="ConfirmTransaction">
      <div className="ConfirmTransaction-row">
        <div className="ConfirmTransaction-row-column">
          To:
          <div className="ConfirmTransaction-addressWrapper">
            <Address
              address={receiverAddress || 'Unknown'}
              title={recipientLabel}
              truncate={truncate}
            />
          </div>
        </div>
        <div className="ConfirmTransaction-row-column">
          From:
          <div className="ConfirmTransaction-addressWrapper">
            <Address
              address={senderAccount ? senderAccount.address : 'Unknown'}
              title={senderAccountLabel}
              truncate={truncate}
            />
          </div>
        </div>
      </div>
      <div className="ConfirmTransaction-row">
        <div className="ConfirmTransaction-row-column">
          <img src={sendIcon} alt="Send" /> Send Amount:
        </div>
        <div className="ConfirmTransaction-row-column">
          <Amount assetValue={`${amount} ${asset.ticker}`} fiatValue="$1" />
        </div>
      </div>
      <div className="ConfirmTransaction-row">
        <div className="ConfirmTransaction-row-column">
          <img src={feeIcon} alt="Fee" /> Max. Transaction Fee:
        </div>
        <div className="ConfirmTransaction-row-column">
          <Amount assetValue={`${maxTransactionFeeBase} ${baseAsset.ticker}`} fiatValue="$1" />
        </div>
      </div>
      <div className="ConfirmTransaction-divider" />
      <div className="ConfirmTransaction-row">
        <div className="ConfirmTransaction-row-column">
          <img src={sendIcon} alt="Total" /> You'll Send:
        </div>
        <div className="ConfirmTransaction-row-column">
          {assetType === 'base' ? (
            <Amount assetValue={`${totalEtherEgress} ${asset.ticker}`} fiatValue="$1" />
          ) : (
            <>
              <Amount assetValue={`${amount} ${asset.ticker}`} fiatValue="$1" />
              <Amount assetValue={`${totalEtherEgress} ${baseAsset.ticker}`} fiatValue="$1" />
            </>
          )}
        </div>
      </div>
      <Button
        basic={true}
        onClick={() => setShowDetails(!showDetails)}
        className="ConfirmTransaction-detailButton"
      >
        {showDetails ? 'Hide' : 'Show'} Details
      </Button>
      {showDetails && (
        <div className="ConfirmTransaction-details">
          <div className="ConfirmTransaction-details-row">
            <div className="ConfirmTransaction-details-row-column">Current Account Balance:</div>
            <div className="ConfirmTransaction-details-row-column">
              {assetType === 'erc20' && (
                <>
                  {' '}
                  {userAssetBalance} {asset.ticker} <br />{' '}
                </>
              )}
              {`${senderAccount ? senderAccount.balance : 'Unknown'} ${baseAsset.ticker}`}
            </div>
          </div>
          <div className="ConfirmTransaction-details-row">
            <div className="ConfirmTransaction-details-row-column">Network:</div>
            <div className="ConfirmTransaction-details-row-column">
              <Network color="blue">{networkName}</Network>
            </div>
          </div>
          <div className="ConfirmTransaction-details-row">
            <div className="ConfirmTransaction-details-row-column">Gas Limit:</div>
            <div className="ConfirmTransaction-details-row-column">{`${gasLimit}`}</div>
          </div>
          <div className="ConfirmTransaction-details-row">
            <div className="ConfirmTransaction-details-row-column">Gas Price:</div>
            <div className="ConfirmTransaction-details-row-column">{`${baseToConvertedUnit(
              gasPrice,
              18
            )} ${baseAsset.ticker} (${baseToConvertedUnit(gasPrice, 9)} gwei)`}</div>
          </div>
          <div className="ConfirmTransaction-details-row">
            <div className="ConfirmTransaction-details-row-column">Max TX Fee:</div>
            <div className="ConfirmTransaction-details-row-column">{`${maxTransactionFeeBase} ${baseAsset.ticker}`}</div>
          </div>
          <div className="ConfirmTransaction-details-row">
            <div className="ConfirmTransaction-details-row-column">Nonce:</div>
            <div className="ConfirmTransaction-details-row-column">{nonce}</div>
          </div>
          {data !== '0x0' && (
            <div className="ConfirmTransaction-details-row">
              <div className="ConfirmTransaction-details-row-column">Data:</div>
              <div className="ConfirmTransaction-details-row-column">
                <span className="ConfirmTransaction-details-row-data">{data}</span>
              </div>
            </div>
          )}
        </div>
      )}
      <Button onClick={onComplete} className="ConfirmTransaction-button">
        Confirm and Send
      </Button>
    </div>
  );
}