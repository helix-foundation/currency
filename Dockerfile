FROM node:lts-gallium AS build

RUN mkdir -p /currency

COPY package.json package-lock.json /currency/

RUN cd /currency && npm install

COPY contracts /currency/contracts
COPY tools /currency/tools
COPY hardhat.config.ts /currency/

RUN cd /currency && npm run build

FROM node:lts-gallium

COPY --from=build /currency /currency

WORKDIR /currency
ENTRYPOINT ["/usr/local/bin/npm", "run", "deploy"]
