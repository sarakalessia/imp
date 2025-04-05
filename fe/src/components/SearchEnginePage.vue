<template>
  <div v-if="!searched">
    <div class="desktop:h-48 tablet:h-32 h-24 flex justify-center">
      <div class="flex justify-end items-start w-full">
        <img alt="Vue logo" class="h-10 desktop:h-20 desktop:top-7 desktop:left-14 tablet:top-3 tablet:h-16 absolute top-2 left-8" src="../assets/logo_datahub.png">
      </div>
    </div>
    <div class="h-screen font-inter bg-bgsearch bg-cover bg-[#f0f0f0] mt-0 font-medium flex flex-col desktop:p-20 text-white">
      <div class="flex flex-col items-center mb-3 desktop:p-14 p-10 mt-10 tablet:mt-28">
        <div class="text-2xl tablet:text-3xl desktop:text-5xl">Il portale della valorizzazione dei dati</div>
        <div class="mt-3 desktop:w-4/5 desktop:text-3xl tablet:text-xl desktop:leading-10 desktop:p-10 pt-10">
          <span v-if="isMobile()">La piattaforma risponde velocemente a domande, analizzando i documenti con l'intelligenza artificiale</span>
          <span v-if="!isMobile()">Con questa piattaforma puoi fare domande e ottenere risposte rapide e precise. L'intelligenza artificiale analizzerà i documenti presenti, offrendoti informazioni chiare e immediate, tutto in pochi secondi!</span>
        </div>
      </div>
      <div class="flex flex-col items-center justify-center desktop:mt-10 tablet:mt-24">
        <div class="font-medium desktop:text-4xl tablet:text-2xl text-xl text-white leading-6 mb-1">Come posso aiutarti?</div>
        <div class="relative desktop:w-[40%] w-[70%] flex flex-col items-center justify-between desktop:h-16 h-10 mt-8">
          <div class="absolute right-1 translate-y-(-50%) -top-1 laptop:-top-1 desktop:top-1 z-50 laptop:h-14 laptop:w-14 content-search cursor-pointer" @click="searchDocuments"></div>
          <input v-model="phrase" type="text" placeholder="Scrivi qui..." class="desktop:text-xl text-[#005A87] laptop:pl-10 pl-4 rounded-[50px] w-full h-20 border-[1px] border-[#ccc] p-[10px]" @keyup.enter="searchDocuments"/>
        </div>
      </div>
    </div>
  </div>
  <div v-else>
    <div v-if="isMobile()" class="fixed top-0 left-0 w-full bg-white z-50 p-4 h-24">
      {{ isActive }}
      <div class="flex items-center justify-between w-full">
        <div class="cursor-pointer w-full"><img alt="Vue logo" src="../assets/logo_datahub.png" class="h-10 absolute top-2 left-8"/></div>
        <div class="cursor-pointer w-full" @click="openMenu"><span class="material-icons cursor-pointer">menu</span></div>
      </div>
      <div class="absolute border-2 flex flex-col w-96 justify-end h-screen top-0 right-0" :class="{ 'right-64': !isActive}">
        <div class="cursor-pointer">
          <input v-model="phrase" type="text" placeholder="Cerca..." class="text-[#005A87] laptop:pl-10 pl-4 rounded-[50px] w-00 h-20 border-[1px] border-[#ccc] text-base" :class="{ 'hidden': isActive}"/>
        </div>
      </div>
    </div>
    <div class="top-3 font-inter mt-10 font-medium h-screen flex flex-row text-black items-center laptop:mt-0">
      <div v-if="!isMobile()" class="flex flex-col w-96 justify-start h-screen border-r-2">
        <div @click="gotoHome" class="cursor-pointer"><img alt="Vue logo" src="../assets/logo_datahub.png" class="h-10 desktop:h-20 desktop:top-7 desktop:left-14 tablet:top-3 tablet:h-16 absolute top-2 left-8"></div>
      </div>
      <div class="flex flex-col w-full h-screen gap-5 pt-20 desktop:text-xl tablet:text-base text-xs overflow-auto">
        <div v-for="(item, index) in history" :key="item.isTest" ref="historyItem" class="flex flex-row w-full justify-start pb-28">
          <div class="flex flex-col w-full justify-between">
            <div class="flex flex-col justify-center max-w-1/3 min-w-20 w-auto mb-10 mr-[10%] px-6 h-auto min-h-14 bg-[#F7F9FB] rounded-[20px] self-end">
              <p class="w-full text-right">{{ item.query }}</p>
            </div>
            <div class="flex flex-col justify-start w-4/5 laptop:w-3/5 mb-3 px-7 ml-[10%] mr-5 h-auto bg-[#F7F9FB] self-start rounded-[20px]">
              <p class="pb-5 pt-7 text-start" v-if="item.explanation === '...'">{{ item.explanation }}</p>
              <p v-else class="pb-5 pt-7 text-start">
                <TypingEffect :text="formatText(item.explanation)" :speed="25" @typing-complete="showList(index)"/>
              </p>
              <ul v-if="showListIndex >= index || (showListIndex === 0 && showListIndex === index)" class="list-disc pl-4">
                <li v-for="(result, idx) in item.results" :key="idx" class="font-medium text-black leading-6 mb-1 text-start pb-10 gap-4">
                  <p v-html="result.title" class="pb-3 underline"></p>
                  <p v-html="result.highlight"></p>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div class="flex flex-row items-center justify-center content-end laptop:w-10/12 w-full h-28 fixed bottom-0 left-auto right-auto bg-white">
          <div class="relative laptop:w-[50%] w-full flex flex-col items-center justify-between content-center h-10">
            <div class="absolute right-1 translate-y-(-50%) laptop:-top-1 z-50 laptop:h-14 laptop:w-14 content-search cursor-pointer" @click="searchDocuments"></div>
            <input v-model="phrase" type="text" placeholder="Scrivi qui..." class="text-[#005A87] laptop:pl-10 pl-4 rounded-[50px] w-full h-20 border-[1px] border-[#ccc] p-[10px] desktop:text-2xl tablet:text-xl text-base" @keyup.enter="searchDocuments"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import TypingEffect from './TypingEffect.vue';

export default {
  name: 'SearchEnginePage',
  components: { TypingEffect },
  props: {
    msg: String,
    title: String
  },
  data() {
    return {
      phrase: '',
      query: '',
      results: [],
      searched: false,
      explanation: '...',
      history: [],
      showListIndex: -1,
      lastSearchPhrase: '',
      isActive: false
    };
  },
  methods: {
    async searchDocuments() {
      this.searched = true;
      try {
        this.query = this.phrase;
        this.history.push({
          results: [],
          explanation: '...',
          query: this.query,
          isTest: true
        });

        const isFollowUp = this.lastSearchPhrase !== '';
        const requestBody = {
          query: this.query,
          limit: 4,
          followUp: isFollowUp,
          followUpText: isFollowUp ? `${this.query} ${this.lastSearchPhrase}` : ''
        };

        this.phrase = '';
        console.log('Request body:', requestBody);
        const proxy = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://api.hexagontest2.ch';
        
        const response = await axios.post(`${proxy}/search_in_doc`, requestBody);
        console.log('Backend response:', JSON.stringify(response.data, null, 2));

        // Map results to match the expected format
        this.results = response.data.results.map(result => ({
          title: result.title || result.file_path?.split('\\').pop() || 'Untitled',
          highlight: result.highlight || result.chunk_text || ''
        }));

        this.explanation = response.data.explanation;

        const updatedHistory = [...this.history];
        updatedHistory[updatedHistory.length - 1] = {
          ...updatedHistory[updatedHistory.length - 1],
          results: this.results.map(result => ({
            title: result.title,
            highlight: this.formatHighlightedText(result.highlight)
          })),
          explanation: this.explanation,
          isTest: false
        };
        this.history = updatedHistory;
          if (lastItem) {
            lastItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        });

        if (!isFollowUp) {
          this.lastSearchPhrase = this.query;
        }
        if (this.explanation === "Nessuna corrispondenza trovata nei documenti disponibili." ||
            this.explanation === "Non ci sono documenti contestuali disponibili. Per favore esegui una nuova ricerca.") {
          this.lastSearchPhrase = '';
        }

      } catch (error) {
        console.error('Search error:', error);
        const updatedHistory = [...this.history];
        updatedHistory[updatedHistory.length - 1] = {
          ...updatedHistory[updatedHistory.length - 1],
          explanation: 'Errore durante la ricerca. Riprova.',
          results: [],
          isTest: false
        };
        this.history = updatedHistory;
      }
    },
    showList(index) {
      this.showListIndex = index;
    },
    formatHighlightedText(highlighted) {
      if (!this.phrase || !highlighted) return highlighted || '';
      const regex = new RegExp(this.phrase, 'gi');
      return highlighted.replace(regex, `__START__${this.phrase}__END__`);
    },
    formatText(text) {
      return text.replace(/__START__(.*?)__END__/g, '<span class="highlight">$1</span>');
    },
    isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    gotoHome() {
      this.lastSearchPhrase = '';
      this.searched = false;
      this.history = [];
      this.showListIndex = -1;
    },
    openMenu() {
      this.isActive = !this.isActive;
    }
  }
}
</script>
  
  <style scoped>
  /* .input-icon {
    position: relative; 
    right: -105px; 
    top: 10%;
    transform: translateY(-50%);
    pointer-events: none;
  } */
  
  /* input {
    border-radius: 50px; 
    width: 100%; 
    height: 80px;
    padding: 10px 40px 10px 10px;
    border: 1px solid #ccc;
  } */

  /* .divImg{
    position: absolute;
    right: 65px; 
    top: 99%; 
    transform: translateY(-50%); 
    pointer-events: none; 
  } */
  </style>
  