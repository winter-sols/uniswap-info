import React, { Component } from "react";
import styled from "styled-components";
import { Box, Flex, Text } from "rebass";
import axios from "axios";
import { BigNumber } from "bignumber.js";

import Wrapper from "./components/Theme";
import Title from "./components/Title";
import FourByFour from "./components/FourByFour";
import Panel from "./components/Panel";
import Dashboard from "./components/Dashboard";
import Select, { Popout } from "./components/Select";
import Footer from "./components/Footer";
import TransactionsList from "./components/TransactionsList";
import Link from "./components/Link";
import Chart from "./components/Chart";

import { urls } from "./helpers/";

import { useWeb3Context } from "web3-react/hooks";

const BASE_URL = "http://uniswap-analytics.appspot.com/api/";

// all our exchange options keyed by exchange address
let exchangeDataRaw = {};
let exchangeSelectOptions = [];

let historyDaysToQuery = 7;
let currentExchangeData;
let app;
let web3 = null;

const Address = props => (
  <Link {...props} color="button" external style={{ wordBreak: "break-all" }}>
    {props.children}
  </Link>
);

const Header = styled(Panel)`
  display: grid;
  grid-template-columns: 1fr 216px;
  align-items: center;
`;

const Divider = styled(Box)`
  height: 1px;
  background-color: rgba(43, 43, 43, 0.05);
`;

const Hint = props => (
  <Text {...props} fontSize={12}>
    {props.children}
  </Text>
);

const timeframeOptions = [
  // { value: "1", label: "1 day" },
  { value: "7", label: "1 week" },
  { value: "30", label: "1 month" },
  { value: "365", label: "1 year" }
];

const Web3Setter = props => {
  if (web3 === null) {
    web3 = useWeb3Context();
  }

  return <div className="dlfkjd" />;
};

class App extends Component {
  constructor(props) {
    super(props);

    app = this;
  }

  // Retreive Data for exchange by it's address
  // @TODO: move this data into state
  getExchangeData = address => exchangeDataRaw[address];

  componentDidMount(props) {
    // Load exchange list
    axios({
      method: "get",
      url: `${BASE_URL}v1/directory`
    }).then(response => {
      // TODO set this in config
      var defaultExchangeAddress = "";

      response.data.forEach(exchange => {
        const {
          symbol,
          exchangeAddress,
          tokenAddress,
          tokenDecimals
        } = exchange;

        // Create Exchange Select Options
        exchangeSelectOptions.push({
          label: `${symbol} - ${exchangeAddress}`,
          value: exchangeAddress
        });

        // Create Exchange Data
        exchangeDataRaw[exchangeAddress] = {
          symbol,
          exchangeAddress,
          tokenAddress,
          tokenDecimals,
          tradeVolume: "0 ETH",
          percentChange: "0.00%",
          ethLiquidity: "0 ETH",
          recentTransactions: [],
          chartData: [],
          userPoolTokens: "0.0000",
          userPoolPercent: "0.00%"
        };

        defaultExchangeAddress = exchangeAddress;
      });

      this.setCurrentExchange(defaultExchangeAddress);
    });
  }

  retrieveExchangeTicker(exchange_address, ticker_retrieved_callback) {
    var url = `${BASE_URL}v1/ticker?exchangeAddress=${exchange_address}`;

    console.log("retrieving ticker for " + exchange_address + "...(" + url + ")");

    axios({
      method: "get",
      url: url
    }).then(response => {
      // grab the exchange data object for this exchange address
      var exchangeData = app.getExchangeData(exchange_address);

      // update the values from the API response
      var responseData = response.data;

      // TODO convert value to eth using helper method?
      var tradeVolume = (responseData["tradeVolume"] / 1e18).toFixed(4);
      var ethLiquidity = (responseData["ethLiquidity"] / 1e18).toFixed(4);

      var priceChangePercent = (
        responseData["priceChangePercent"] * 100
      ).toFixed(2);

      var erc20Liquidity = (
        responseData["erc20Liquidity"] /
        Math.pow(10, exchangeData.tokenDecimals)
      ).toFixed(4);

      exchangeData["tradeVolume"] = `${tradeVolume} ETH`;
      exchangeData["ethLiquidity"] = `${ethLiquidity} ETH`;

      exchangeData["erc20Liquidity"] = `${erc20Liquidity} ${
        exchangeData.symbol
      }`;

      if (priceChangePercent > 0) {
        exchangeData["percentChange"] = "+";
      } else {
        exchangeData["percentChange"] = "";
      }
      exchangeData["percentChange"] += priceChangePercent + "%";

      // only update UI if we're still displaying the initial requested address
      if (exchangeData.exchangeAddress === exchange_address) {
        app.setState({});

        ticker_retrieved_callback();
      }
    });
  }

  retrieveUserPoolShare(exchange_address, pool_share_retrieved_callback) {
    // TODO when we update to newer web3-react, check if we have a valid user account to query,
    // if not then just call pool_share_retrieved_callback() immediately
    axios({
      method: "get",
      url: `${BASE_URL}v1/user?exchangeAddress=${exchange_address}&userAddress=${
        web3.account
      }`
    }).then(response => {
      // update the values from the API response
      var responseData = response.data;

      // grab the exchange data object for this exchange address
      var exchangeData = app.getExchangeData(exchange_address);

      var user_pool_tokens = new BigNumber(
        responseData["userNumPoolTokens"]
      ).dividedBy(1e18);
      var user_pool_percentage = responseData["userPoolPercent"] * 100;

      exchangeData.userPoolTokens = `${user_pool_tokens.toFixed(
        4
      )} Pool Tokens`;
      exchangeData.userPoolPercent = `${user_pool_percentage.toFixed(2)}%`;

      if (exchangeData.exchangeAddress === exchange_address) {
        app.setState({});

        pool_share_retrieved_callback();
      }
    });
  }

  // load exchange history for X days back
  retrieveExchangeHistory(exchange_address, days_to_query) {    
    var exchangeData = app.getExchangeData(exchange_address);
    exchangeData.recentTransactions = [];
    exchangeData.chartData = [];

    // use current time as now
    var utcEndTimeInSeconds = Date.now() / 1000;

    // go back x days
    var utcStartTimeInSeconds =
      utcEndTimeInSeconds - 60 * 60 * 24 * days_to_query;

    var url = `${BASE_URL}v1/history?exchangeAddress=${exchange_address}&startTime=${utcStartTimeInSeconds}&endTime=${utcEndTimeInSeconds}`;

    console.log("retrieving transaction history...(" + url + ")");

    axios({
      method: "get",
      url: url
    }).then(response => {
      // parse history into buckets segmented by day
      var exchangeData = app.getExchangeData(exchange_address);

      var chartBucketDatas = {}; // chart data grouped by hour or day

      var chartBucketOrderedLabels = []; // the order of the buckets from left to right (x axis)
      var chartBucketOrderedTimestamps = [];

      var startOfTodayUTC = new Date();
        startOfTodayUTC.setUTCHours(0, 0, 0, 0);
        startOfTodayUTC = startOfTodayUTC.getTime() / 1000;

      if (days_to_query === 1) {
        // TODO buckets will be by hour
      } else {
        var dateNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec"
        ];

        // buckets will be by day
        for (var i = days_to_query; i >= 0; i--) {
          var startUTCforBucket = startOfTodayUTC - 60 * 60 * 24 * i;

          var date = new Date(startUTCforBucket * 1000);

          var bucketLabel = `${
            dateNames[date.getUTCMonth()]
          } ${date.getUTCDate()}`;

          chartBucketOrderedTimestamps.push(startUTCforBucket);
          // put an empty data object in for this bucket
          chartBucketDatas[startUTCforBucket] = {
            tradeVolume: new BigNumber(0),
            curEthLiquidity: null,
            curTokenLiquidity: null,
            label: bucketLabel
          };
        }
      }

      response.data.forEach(transaction => {
        exchangeData.recentTransactions.push(transaction);

        var tx_timestamp = transaction["timestamp"];
        var tx_event = transaction["event"];
        
        var eth_amount = new BigNumber(transaction["ethAmount"]);
        var cur_eth_liquidity = new BigNumber(transaction["curEthLiquidity"]);

        var token_amount = new BigNumber(transaction["tokenAmount"]);
        var cur_token_liquidity = new BigNumber(transaction["curTokenLiquidity"]);

        var bucket = null;

        for (var i = chartBucketOrderedTimestamps.length - 1; i >= 0; i--) {
          // if this tx timestamp is greater than or equal to a bucket's timestamp, it's in that bucket
          if (tx_timestamp >= chartBucketOrderedTimestamps[i]) {
            bucket = chartBucketDatas[chartBucketOrderedTimestamps[i]];
            break;
          }
        }

        // if this was a trading event, we can consider its volume
        if (tx_event === "EthPurchase" || tx_event === "TokenPurchase") {
          bucket.tradeVolume = bucket.tradeVolume.plus(
            eth_amount.absoluteValue()
          );
        }

        // transactions are ordered from newest to oldest, so set it on the first time we encounter a null liquidity value for a bucket
        // update current eth liquidity for the bucket
        if (bucket.curEthLiquidity == null) {
          bucket.curEthLiquidity = cur_eth_liquidity;
        }

        // update current token liquidity for the bucket
        if (bucket.curTokenLiquidity == null) {
          bucket.curTokenLiquidity = cur_token_liquidity;
        }        
      });

      // for buckets without any transactions, they can refer to the carry over values from the previous bucket
      // TODO this could be an issue for exchanges with long periods of no trades. Init thse to the current liquidity at a given date
      var curEthLiquidityCarryOver = new BigNumber(0);
      var curTokenLiquidityCarryOver = new BigNumber(0);

      var tokenDecimalExp = (new BigNumber(10)).exponentiatedBy(exchangeData.tokenDecimals);

      chartBucketOrderedTimestamps.forEach(timestamp => {
        // get the bucket data for this name
        var bucket = chartBucketDatas[timestamp];

        // console.log(timestamp + "     " + bucket.tradeVolume.toFixed());
        bucket.tradeVolume = bucket.tradeVolume.dividedBy(1e18);

        if (bucket.curEthLiquidity == null) {
          bucket.curEthLiquidity = curEthLiquidityCarryOver;
        } else {
          curEthLiquidityCarryOver = bucket.curEthLiquidity;
        }

        if (bucket.curTokenLiquidity == null) {
          bucket.curTokenLiquidity = curTokenLiquidityCarryOver;
        } else {
          curTokenLiquidityCarryOver = bucket.curTokenLiquidity;
        }

        var marginalRate = new BigNumber(0);

        if (bucket.curTokenLiquidity != 0) {
          marginalRate = bucket.curEthLiquidity.dividedBy(bucket.curTokenLiquidity);
        }

        // Data Object for Chart
        exchangeData.chartData.push({
          date: bucket.label,
          
          ethLiquidity : bucket.curEthLiquidity.dividedBy(1e18).toFixed(4),
          tokenLiquidity : bucket.curTokenLiquidity.dividedBy(tokenDecimalExp).toFixed(4),

          volume: bucket.tradeVolume.toFixed(4),
          rate: marginalRate.toFixed(4)
        });
      });

      // only update UI if we're still displaying the initial requested address
      if (exchangeData.exchangeAddress === exchange_address) {
        app.setState({});
      }
    });
  }

  // Set the current exchange's data to be shown
  setCurrentExchange(address) {
    currentExchangeData = app.getExchangeData(address);

    // What is this for?
    app.setState({});

    app.retrieveExchangeTicker(address, () =>
      app.retrieveUserPoolShare(address, () =>
        app.retrieveExchangeHistory(address, historyDaysToQuery)
      )
    );
  }

  render() {
    if (exchangeSelectOptions.length === 0) {
      // TODO Show loading indicator
      console.log("loading");

      return (
        <Wrapper>
          {/* @TODO: find better way to handle this */}
          <>
            <Web3Setter />
          </>
        </Wrapper>
      );
    } else {
      return (
        <Wrapper>
          <Header
            px={24}
            py={3}
            bg={["mineshaft", "transparent"]}
            color={["white", "black"]}
          >
            <Title />
            
            {/* <Popout data={exchangeSelectOptions} /> */}

            <Select
              options={exchangeSelectOptions}
              onChange={newOption => {
                // only update current exchange if we're picking a new one
                if (currentExchangeData.exchangeAddress !== newOption.value)
                  app.setCurrentExchange(newOption.value);
              }}
            />
          </Header>

          <Dashboard mx="auto" px={[0, 3]}>
            <Box style={{ gridArea: "volume" }}>
              <Panel grouped rounded color="white" bg="jaguar" p={24}>
                <FourByFour
                  gap={24}
                  topLeft={
                    <Hint color="textLightDim">
                      {currentExchangeData.symbol} Volume
                    </Hint>
                  }
                  bottomLeft={
                    <Text fontSize={24} lineHeight={1.4} fontWeight={500}>
                      {currentExchangeData.tradeVolume}
                    </Text>
                  }
                  topRight={<Hint color="textLightDim">24h</Hint>}
                  bottomRight={
                    <Text fontSize={20} lineHeight={1.4}>
                      {currentExchangeData.percentChange}
                    </Text>
                  }
                />
              </Panel>
              <Panel grouped rounded color="white" bg="maker" p={24}>
                <FourByFour
                  topLeft={<Hint color="textLight">Your share</Hint>}
                  bottomLeft={
                    <Text fontSize={20} lineHeight={1.4} fontWeight={500}>
                      {currentExchangeData.userPoolTokens}
                    </Text>
                  }
                  bottomRight={
                    <Text fontSize={20} lineHeight={1.4}>
                      {currentExchangeData.userPoolPercent}
                    </Text>
                  }
                />
                <FourByFour
                  mt={3}
                  topLeft={<Hint color="textLight">Your fees</Hint>}
                  bottomLeft={
                    <Text fontSize={20} lineHeight={1.4} fontWeight={500}>
                      0.00 {currentExchangeData.symbol}
                    </Text>
                  }
                  bottomRight={
                    <Text fontSize={20} lineHeight={1.4}>
                      0.00 ETH
                    </Text>
                  }
                />
              </Panel>
            </Box>

            <Panel rounded p={24} bg="white" area="liquidity">
              <FourByFour
                topLeft={<Hint>{currentExchangeData.symbol} Liquidity</Hint>}
                bottomLeft={
                  <Text
                    fontSize={20}
                    color="maker"
                    lineHeight={1.4}
                    fontWeight={500}
                  >
                    {currentExchangeData.erc20Liquidity || `0.00`}
                  </Text>
                }
                topRight={<Hint>ETH Liquidity</Hint>}
                bottomRight={
                  <Text
                    fontSize={20}
                    color="uniswappink"
                    lineHeight={1.4}
                    fontWeight={500}
                  >
                    {currentExchangeData.ethLiquidity || `0.00 ETH`}
                  </Text>
                }
              />
            </Panel>

            <Panel rounded bg="white" area="statistics">
              <Box p={24}>
                <Flex alignItems="center" justifyContent="space-between">
                  <Text>Pool Statistics</Text>
                  <Box width={144}>
                    <Select
                      placeholder="..."
                      options={timeframeOptions}
                      onChange={newOption => {
                        historyDaysToQuery = newOption.value;

                        app.retrieveExchangeHistory(
                          currentExchangeData.exchangeAddress,
                          historyDaysToQuery
                        );

                        app.setState({});
                      }}
                    />
                  </Box>
                </Flex>
              </Box>
              <Divider />

              <Box p={24}>
                <Chart data={currentExchangeData.chartData} />
              </Box>
            </Panel>

            <Panel rounded bg="white" area="exchange">
              <Box p={24}>
                <Hint color="textSubtext" mb={3}>
                  Exchange Address
                </Hint>
                <Address
                  href={urls.showAddress(currentExchangeData.exchangeAddress)}
                >
                  {currentExchangeData.exchangeAddress}
                </Address>
              </Box>

              <Box p={24}>
                <Hint color="textSubtext" mb={3}>
                  Token Address
                </Hint>
                <Address
                  href={urls.showAddress(currentExchangeData.tokenAddress)}
                >
                  {currentExchangeData.tokenAddress}
                </Address>
              </Box>
            </Panel>

            <Panel rounded bg="white" area="transactions">
              <Flex p={24} justifyContent="space-between">
                <Text color="text">Latest Transactions</Text>
                {/* <Text>↓</Text> */}
              </Flex>
              <Divider />
              <TransactionsList
                transactions={currentExchangeData.recentTransactions}
              />
            </Panel>
          </Dashboard>

          <Footer />
        </Wrapper>
      );
    }
  }
}

export default App;
