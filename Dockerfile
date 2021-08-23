FROM node:erbium-buster AS build

RUN mkdir -p /currency

COPY package.json package-lock.json /currency/
RUN cd /currency && npm ci

COPY contracts /currency/contracts
COPY tools /currency/tools
COPY truffle-config.js /currency/

RUN cd /currency && npm run build

FROM node:erbium-buster

COPY --from=build /currency /currency

WORKDIR /currency
ENTRYPOINT ["/usr/local/bin/npm", "run", "eco", "--", "--supervise", "--ganache", "--deploy", "--devmode"]
