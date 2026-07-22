import json
import re
import sys

def main():
    try:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            html = f.read()
            
        match = re.search(r'tailwind\.config\s*=\s*({.*?})\s*</script>', html, re.DOTALL)
        if not match:
            print("Could not find tailwind config in HTML")
            return
            
        # This is JS object syntax, needs to be parsed or regexed. 
        # Since it's a JS object, let's just do some basic regex replacements to make it valid JSON
        # It's actually a valid JSON-like structure except for keys without quotes.
        # But wait, looking at the view_file output, the keys are mostly quoted!
        # Let's write a simpler way: just output the CSS directly by hardcoding from the view_file output!
        pass
    except Exception as e:
        print(e)

if __name__ == '__main__':
    main()
