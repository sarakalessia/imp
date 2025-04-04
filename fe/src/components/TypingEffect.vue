<template>
  <div>{{ displayedText }}</div>
</template>

<script>
export default {
  props: {
    text: {
      type: String,
      required: true
    },
    speed: {
      type: Number,
      default: 50 // Velocità della scrittura in ms per carattere
    }
  },
  data() {
    return {
      displayedText: "", // Testo visualizzato gradualmente
      index: 0
    };
  },
  mounted() {
    this.type();
  },
  methods: {
    type() {
//console.log("this.index",this.index, "this.text.length",this.text.length, "testo:",this.text[this.index])
      if(this.text.length > 0) {
        if (this.index < this.text.length) {
            this.displayedText += this.text[this.index];
            //console.log("this.displayedText",this.displayedText)
            this.index++;
            setTimeout(this.type, this.speed);
        } else {
            // Notifica il completamento della scrittura
            this.$emit('typing-complete');
        }
      }
    }
  }
};
</script>

<style scoped>
/* Puoi aggiungere stili personalizzati qui */
</style>
