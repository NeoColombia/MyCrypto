import { LocalStorage } from 'v2/types';
import { noOp } from 'v2/utils';

import { SCHEMA_DEFAULT, migrate } from './v1.0.0';

export const dbVersions = {
  'v1.0.0': {
    version: 'v1.0.0',
    main: 'MYCStorage_v1.0.0',
    vault: 'MYCVault_v1.0.0',
    defaultValues: SCHEMA_DEFAULT,
    schema: {},
    migrate: (prev: LocalStorage, curr: LocalStorage) => migrate(prev, curr)
  },
  'v0.0.1': {
    version: 'v0.0.1',
    main: 'MyCryptoStorage',
    vault: 'MyCryptoEncrypted',
    schema: {},
    migrate: noOp
  }
};

export const dbHistory = ['v1.0.0', 'v0.0.1'];

// @ts-ignore
export const getCurrentDBConfig = () => dbVersions[dbHistory[0]];

// @ts-ignore
export const getPreviousDBConfig = () => dbVersions[dbHistory[1]];

export const getData = () => {
  // 1. check previous database
  const latestDB = getCurrentDBConfig();
  const previousDB = getPreviousDBConfig();
  const existingDBs = Object.keys(localStorage);
  const latestExists = existingDBs.findIndex(k => k === latestDB.main) >= 0;
  const staleExists = existingDBs.findIndex(k => k === previousDB.main) >= 0;

  if (latestExists) {
    // if valid return
    return localStorage[latestDB.main];
  } else if (staleExists) {
    // if outdated perform migrations & destroy previous db
    console.debug(`Perfoming migration from ${previousDB.version} to ${latestDB.version}`);
    return latestDB.migrate(localStorage[previousDB.main], latestDB.defaultValues);
  } else {
    // if empty return default
    return latestDB.defaultValues;
  }
};