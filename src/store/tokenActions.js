import { rpc } from '../lib/rpcapi';
import { parseString, padLeft, getNakedAddress, fromTokens } from '../lib/convert';

export function loadTokenBalanceOf(token, accountId) {
    return (dispatch) => {
        const balanceOfId = '0x70a08231';
        const address = padLeft(getNakedAddress(accountId), 64);
        const data = balanceOfId + address;
        rpc('eth_call', [{ to: token.address, data }, 'latest']).then((resp) =>
            dispatch({
                type: 'ACCOUNT/SET_TOKEN_BALANCE',
                accountId,
                token,
                value: resp.result,
            })
        );
    };
}

export function loadTokenDetails(token) {
    return (dispatch, getState) => {
        const tokenSupplyId = '0x18160ddd';
        const decimalsId = '0x313ce567';
        const symbolId = '0x95d89b41';
        const nameId = '0x06fdde03';
        rpc('eth_call', [{ to: token.address, data: tokenSupplyId }, 'latest']).then((resp) => {
            dispatch({
                type: 'TOKEN/SET_TOTAL_SUPPLY',
                address: token.address,
                value: resp.result,
            });
        });
        rpc('eth_call', [{ to: token.address, data: decimalsId }, 'latest']).then((resp) => {
            dispatch({
                type: 'TOKEN/SET_DECIMALS',
                address: token.address,
                value: resp.result,
            });
        });
        rpc('eth_call', [{ to: token.address, data: symbolId }, 'latest']).then((resp) => {
            dispatch({
                type: 'TOKEN/SET_SYMBOL',
                address: token.address,
                value: parseString(resp.result),
            });
        });
        const accounts = getState().accounts;
        if (!accounts.get('loading')) {
            accounts.get('accounts')
                    .map((acct) => dispatch(loadTokenBalanceOf(token, acct.get('id'))));
        }
    };
}

/*
 * json.result should return a list of tokens.
 * Each token should have name, contract address, and ABI
 */
export function loadTokenList() {
    return (dispatch) => {
        dispatch({
            type: 'TOKEN/LOADING',
        });
        rpc('emerald_contracts', []).then((json) => {
            const tokens = json.result.filter((contract) => {
                contract.features = contract.features || [];
                return contract.features.indexOf('erc20') >= 0;
            });
            dispatch({
                type: 'TOKEN/SET_LIST',
                tokens,
            });
            tokens.map((token) => dispatch(loadTokenDetails(token)));
        });
    };
}

export function addToken(address, name) {
    return (dispatch) =>
        rpc('emerald_addContract', [{
            address,
            name,
        }]).then((json) => {
            dispatch({
                type: 'TOKEN/ADD_TOKEN',
                address,
                name,
            });
            dispatch(loadTokenDetails({ address }));
        });
}

export function transferTokenTransaction(accountId, to, gas, gasPrice, value, tokenId, isTransfer) {
    return (dispatch, getState) => {
        const transferId = '0xa9059cbb'; // transfer(address,uint256)
        const approveId = '0x095ea7b3'; // approve(address,uint256)
        const tokens = getState().tokens;
        const token = tokens.get('tokens').find((tok) => tok.get('address') === tokenId);
        const numTokens = padLeft(fromTokens(value, token.get('decimals')).toString(16), 64);
        const address = padLeft(getNakedAddress(to), 64);
        let data;
        if (isTransfer === 'true') data = transferId + address + numTokens;
        else data = approveId + address + numTokens;
        return rpc('eth_call', [{
            to: tokenId,
            from: accountId,
            gas,
            gasPrice,
            value: '0x00',
            data,
        }, 'latest']).then((json) => {
            dispatch({
                type: 'ACCOUNT/SEND_TOKEN_TRANSACTION',
                accountId,
                txHash: json.result,
            });
            dispatch(loadTokenDetails({ address: token }));
            return json.result;
        });
    };
}
