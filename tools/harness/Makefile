# Test-media fixtures. Nothing here is committed; `pnpm test:e2e` writes minimal
# in-process fallbacks if these are absent, so ffmpeg is optional.
FIX := fixtures
TONES := 440 554 659 784
COLORS := red green blue yellow

.PHONY: fixtures clean-fixtures
fixtures: $(FIX)/peer1.wav $(FIX)/peer2.wav $(FIX)/peer3.wav $(FIX)/peer4.wav \
          $(FIX)/peer1.y4m $(FIX)/peer2.y4m $(FIX)/peer3.y4m $(FIX)/peer4.y4m \
          $(FIX)/player.webm

# Audio: 16-bit PCM WAV, distinct sine per peer, ducking envelope 3s silence / 2s tone / 3s silence.
$(FIX)/peer%.wav:
	@mkdir -p $(FIX)
	ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=$(word $*,$(TONES)):sample_rate=48000:duration=8" \
	  -af "volume='if(between(mod(t,8),3,5),0.6,0)':eval=frame" -c:a pcm_s16le $@

# Video: Y4M, solid colour per peer with a burned-in label.
$(FIX)/peer%.y4m:
	@mkdir -p $(FIX)
	ffmpeg -y -loglevel error -f lavfi -i "color=c=$(word $*,$(COLORS)):size=160x120:rate=15:duration=2" \
	  -vf "drawtext=text='peer$*':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -pix_fmt yuv420p $@

# Fake player source: 5.5 minutes of test pattern with a burned-in timecode.
$(FIX)/player.webm:
	@mkdir -p $(FIX)
	ffmpeg -y -loglevel error -f lavfi -i "testsrc2=size=320x180:rate=15:duration=330" -f lavfi -i "sine=frequency=220:duration=330" \
	  -vf "drawtext=text='%{pts\:hms}':fontsize=24:fontcolor=white:x=10:y=10:box=1:boxcolor=black@0.5" \
	  -c:v libvpx -b:v 200k -c:a libopus -b:a 32k $@

clean-fixtures:
	rm -f $(FIX)/*.wav $(FIX)/*.y4m $(FIX)/*.webm
