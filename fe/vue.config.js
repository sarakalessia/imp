// const { defineConfig } = require('@vue/cli-service')

// module.exports = defineConfig({
//   transpileDependencies: true,
//   devServer: {
//     proxy: 'http://localhost:3000' // Cambia la porta se necessario
//   }
// })
module.exports = {
  devServer: {
    proxy: process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://api.hexagontest2.ch'
  },
  configureWebpack: {
    // Configurazioni differenti per ottimizzare la produzione
    optimization: {
      splitChunks: {
        chunks: 'all',
      },
    },
  },
  // Altre configurazioni
};
