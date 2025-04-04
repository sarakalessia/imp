<template>
  <div id="app">
    <Auth v-if="!isAuthenticated" @authenticated="isAuthenticated = true" />
    <SearchEnginePage v-else />
  </div>
</template>

<script>
import Auth from './components/AuthenticationForm.vue';
import SearchEnginePage from './components/SearchEnginePage.vue';
export default {
  name: 'App',
  components: {
    Auth,
    SearchEnginePage
  },
  data() {
    return {
      isAuthenticated: true, // Stato di autenticazione iniziale
    };
  },
}
</script>

<style>

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

img{
  margin-top: 20px;
  margin-bottom: 20px;
  position: absolute;
  left: 50px;
}

</style>