<template>
  <div class="desktop:h-48 tablet:h-32 h-24 flex justify-center">
    <div class="flex justify-end items-start w-full ">
      <img alt="Vue logo" class="h-10 desktop:h-20 desktop:top-7 desktop:left-14 tablet:top-3 tablet:h-16 absolute top-2 left-8" src="../assets/logo_datahub.png">
    </div>
  </div>
  <div class="h-screen font-inter bg-bgsearch bg-cover bg-[#f0f0f0] mt-0 font-medium flex flex-col desktop:p-20 text-black"> 
    <div class="flex items-center justify-center h-screen ">
      <div class="bg-white p-6 rounded shadow-md">
        <h2 class="text-2xl mb-4">Inserisci la password</h2>
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          class="border p-2 rounded w-full"
        />
        <button @click="checkPassword" class="mt-4 bg-blue-500 text-white px-4 py-2 rounded">
          Accedi
        </button>
        <p v-if="errorMessage" class="text-red-500 mt-2">{{ errorMessage }}</p>
      </div>
    </div>
  </div>
  </template>
  
  <script>
  export default {
    name: 'AuthenticationForm', // Nome del componente aggiornato
    data() {
      return {
        password: '',
        errorMessage: '',
      };
    },
    methods: {
      checkPassword() {
        const correctPassword = 'Imperialida2024!'; // Sostituisci con la tua password
        if (this.password === correctPassword) {
          this.$emit('authenticated');
        } else {
          this.errorMessage = 'Password errata. Riprova.';
        }
      },
    },
  };
  </script>
  
  <style scoped>
  /* Aggiungi eventuali stili personalizzati qui */
  </style>
  