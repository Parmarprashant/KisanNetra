import json
import sys

def main():
    try:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            data = json.load(f)
            screens = data.get('screens', [])
            
            flows = {"Auth": [], "Dashboard": [], "Settings": [], "Misc": []}
            
            print(f"Total screens: {len(screens)}")
            for screen in screens:
                name = screen.get('name', 'Unknown')
                title = screen.get('title', 'Untitled')
                print(f"- {title} ({name.split('/')[-1]})")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
